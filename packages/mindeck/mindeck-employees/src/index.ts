/**
 * Digital employees for Mindeck Desktop. The plugin registers the built-in general assistant and each digital
 * employee the company sets up in Mindeck Cloud as an agent preset built on a base preset's plugins with its own
 * persona, keeps each member's employees in a local cache, and streams the employee cards to the digital-employee
 * page. Employees that leave the Cloud listing stay registered as retired, so their conversations continue.
 * @module @deepseek-ai/dsh-mindeck-employees
 */
import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import z from '@deepseek-ai/schemastery'
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import { entryListProblem, type PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import type { AgentPresetDocument } from '@deepseek-ai/dsh-agent-preset-registry/types'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-mindeck-account'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { deadline } from '@deepseek-ai/dsh-timeout'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { deepEqualJson } from '@deepseek-ai/dsh-util-values'
import { load } from 'js-yaml'
import { type CachedEmployee, type EmployeeCache, type EmployeeOwner, employeesOf, mergeListing, readCache, sameOwner, withOwner, writeCache } from './cache.ts'
import { fetchEmployees } from './cloud.ts'
import {
  employeeDefinition, employeePresetId, GENERAL_PRESET_ID, generalDefinition, libraryFolderPath, type PresetRows,
} from './presets.ts'
import { PublishedValue } from './published.ts'
import type { MindeckEmployeeCard, MindeckEmployeeCatalog } from './types.ts'

export { employeePersona, employeePresetId, GENERAL_PRESET_ID, libraryFolderPath } from './presets.ts'
export type {
  MindeckEmployeeCard, MindeckEmployeeCatalog, MindeckEmployeeFolderView, MindeckEmployeeView, MindeckGeneralView,
} from './types.ts'

/** A library folder that a conversation's digital employee consults, for the file-library search. */
export interface EmployeeLibraryFolder {
  /** OpenCloud resource id of the folder. */
  readonly itemId: string
  /** Name the company gave the material. */
  readonly label: string
  /** Library path the employee's persona names the folder by, such as `/企业空间/制度文件`. */
  readonly path: string
  /** Whether the member's department may open the folder, as Mindeck Cloud judges it. */
  readonly accessible: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    mindeckEmployees: MindeckEmployees
  }
}

/** Deployment options. */
export interface Config {
  /** Agent preset whose plugin rows every Mindeck preset reuses with its own persona. */
  basePreset: string
  /** Persona prefix template of the general assistant; `{{model}}` names the model. */
  generalPersona: string
  /** Cache directory; empty means `mindeck` under the DeepSeek Harness home (`$DSH_HOME` or `~/.dsh`). */
  cacheDir: string
  /**
   * Interval between full listing refreshes while signed in, in milliseconds. The account's sync refreshes the listing
   * as soon as Mindeck Cloud reports a change, so this interval only bounds the delay on a Mindeck Cloud without sync.
   */
  refreshIntervalMs: number
  /** First wait after a failed refresh, in milliseconds; it doubles after each failure up to `refreshIntervalMs`. */
  retryIntervalMs: number
  /** Timeout of one Mindeck Cloud request in milliseconds. */
  requestTimeoutMs: number
  /**
   * LLM providers that serve the company's models, searched in order for an employee's default model; mindeck-models
   * registers these routes.
   */
  modelProviders: string[]
}

/**
 * Resolve the cache directory; an empty setting selects `mindeck` under the DSH home.
 * @param config - deployment options.
 * @returns the absolute cache directory.
 */
export function resolveCacheDir(config: Pick<Config, 'cacheDir'>): string {
  return config.cacheDir === '' ? join(resolveDshHome(), 'mindeck') : resolve(config.cacheDir)
}

const GENERAL_CARD: MindeckEmployeeCard = { kind: 'general', presetId: GENERAL_PRESET_ID }

/** One registered preset: the definition it was registered with and the registry's disposer. */
interface Registration {
  readonly definition: PresetDefinition
  readonly dispose: () => Promise<void>
}

/** Registers the general assistant and the member's digital employees as agent presets and lists them for the digital-employee page. */
export default class MindeckEmployees extends TypertRemoteService {
  static inject = ['agentPresets', 'mindeckAccount', 'typert']
  static Config: z<Config> = z.object({
    basePreset: z.string().min(1).default('standard')
      .description('Agent preset whose plugin rows every Mindeck preset reuses with its own persona.'),
    generalPersona: z.string().default('You are a work assistant powered by the {{model}} model.')
      .description('Persona prefix template of the general assistant; `{{model}}` names the model.'),
    cacheDir: z.string().default('')
      .description('Cache directory; empty means `mindeck` under the DeepSeek Harness home.'),
    refreshIntervalMs: z.natural().min(60_000).default(600_000)
      .description('Interval between full digital-employee refreshes while signed in, in milliseconds; a sync refreshes sooner.'),
    retryIntervalMs: z.natural().min(1000).default(15_000)
      .description('First wait after a failed refresh, in milliseconds; it doubles up to refreshIntervalMs.'),
    requestTimeoutMs: z.natural().min(1000).default(15_000)
      .description('Timeout of one Mindeck Cloud request in milliseconds.'),
    modelProviders: z.array(z.string().min(1)).default(['mindeck-anthropic', 'mindeck-openai', 'mindeck-openai-responses'])
      .description('LLM providers that serve the company\'s models, searched in order for an employee\'s default model.'),
  })

  private readonly cacheFile: string
  private readonly lifetime = new AbortController()
  private cache: EmployeeCache | undefined
  private readonly registrations = new Map<string, Registration>()
  /** The employee behind each employee preset of the member whose presets are registered, retired ones included. */
  private employeesByPreset: ReadonlyMap<string, CachedEmployee> = new Map()
  /** The member's employees the cards show, current ones first. */
  private shown: readonly CachedEmployee[] = []
  private cardsRevision = 0
  /** Sessions whose preset changed before their Agent was published; the model is chosen once it is. */
  private readonly presetChanged = new Set<SessionId>()
  /** The default model this plugin chose for a blank conversation, until its preset changes again. */
  private readonly chosen = new WeakMap<Agent, ModelSelection>()
  /** The latest model choice of each Agent, so choices for one conversation apply in order. */
  private readonly choosing = new WeakMap<Agent, Promise<void>>()
  /** The member whose employees are registered; null before any member is known. */
  private owner: EmployeeOwner | null = null
  private readonly catalog = new PublishedValue<MindeckEmployeeCatalog>({ cards: [] })
  private running: Promise<void> | undefined
  private again = false
  private retryDelay: number
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  /** @param ctx - Host with the agent preset registry and the Mindeck account. @param config - deployment options. */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'mindeckEmployees', { namespace: 'mindeckEmployees' })
    this.cacheFile = join(resolveCacheDir(config), 'employees.json')
    this.retryDelay = config.retryIntervalMs
    ctx.effect(() => async () => {
      this.lifetime.abort()
      clearTimeout(this.retryTimer)
      await this.running
      for (const [id, registration] of [...this.registrations].reverse()) {
        this.registrations.delete(id)
        await registration.dispose()
      }
    }, 'mindeck-employees: agent presets')
    ctx.on('mindeck-account/changed', () => { this.refresh() })
    ctx.on('mindeck-account/revised', (topics) => { if (topics.has('employees')) this.refresh() })
    // The card names an employee's default model once the company catalog lists it.
    ctx.on('llm/models-updated', () => { void this.publishCards() })
    // A new conversation, and a blank one that changes preset, start on the employee's default model.
    ctx.on('agent/created', async ({ agent, source }) => {
      const changed = this.presetChanged.delete(agent.id)
      if (source === 'startup' || changed) await this.chooseModel(agent)
    })
    ctx.on('agent-preset/selected', (sessionId) => {
      const agent = ctx.get('agents')?.get(sessionId)
      if (agent === undefined) { this.presetChanged.add(sessionId); return }
      void this.chooseModel(agent)
    })
    ctx.effect(() => {
      const timer = setInterval(() => { this.refresh() }, config.refreshIntervalMs)
      return () => { clearInterval(timer) }
    }, 'mindeck-employees: refresh timer')
    this.refresh()
  }

  /**
   * Read which digital employee a live conversation talks to.
   * @param sessionId - the conversation's Session.
   * @returns the Mindeck Cloud employee id of the Session's preset, or undefined for the general assistant, another
   *   preset, or a Session without a live Agent.
   */
  employeeForSession(sessionId: SessionId): string | undefined {
    return this.employeeOf(sessionId)?.id
  }

  /**
   * Read the library folders that a live conversation's digital employee consults.
   * @param sessionId - the conversation's Session.
   * @returns the employee's folders, empty when it has none; undefined for the general assistant, another preset, or
   *   a Session without a live Agent.
   */
  foldersForSession(sessionId: SessionId): readonly EmployeeLibraryFolder[] | undefined {
    return this.employeeOf(sessionId)?.folders.map(({ itemId, label, path, accessible }) => ({
      itemId, label, path: libraryFolderPath(path), accessible,
    }))
  }

  private employeeOf(sessionId: SessionId): CachedEmployee | undefined {
    const session = this.ctx.get('agents')?.get(sessionId)?.session
    const preset = session === undefined ? undefined : this.ctx.get('agentPresets')?.presetForSession(session)
    return preset == null ? undefined : this.employeesByPreset.get(preset)
  }

  /**
   * Stream the cards of the digital-employee page.
   * @param signal - stream lifetime.
   * @returns the current cards, then every change.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<MindeckEmployeeCatalog> {
    yield* this.catalog.follow(AbortSignal.any([signal, this.lifetime.signal]))
  }

  // Read through a method: a check after `await` must not reuse an earlier narrowing.
  private stopped(): boolean { return this.lifetime.signal.aborted }
  // Read through a method: `sync` may request a rerun while the refresh loop awaits it.
  private rerunRequested(): boolean { return this.again }

  /** Request a synchronization; requests made while one runs coalesce into one rerun afterwards. */
  private refresh(): void {
    if (this.stopped()) return
    this.again = true
    this.running ??= this.drain().finally(() => {
      this.running = undefined
      // A request that arrived after the last check but before this settled starts the next drain.
      if (this.rerunRequested()) this.refresh()
    })
  }

  /** Synchronize until no request is pending; a failure keeps the registrations and schedules a retry. */
  private async drain(): Promise<void> {
    while (this.rerunRequested() && !this.stopped()) {
      this.again = false
      try {
        await this.sync()
        this.retryDelay = this.config.retryIntervalMs
        clearTimeout(this.retryTimer)
      } catch (error) {
        if (this.stopped()) return
        this.ctx.logger.warn('mindeck-employees: keeping the registered digital employees; refresh failed', error)
        this.scheduleRetry()
      }
    }
  }

  /** Refresh again soon after a failure, waiting twice as long after each further failure. */
  private scheduleRetry(): void {
    clearTimeout(this.retryTimer)
    const delay = this.retryDelay
    this.retryDelay = Math.min(this.retryDelay * 2, this.config.refreshIntervalMs)
    this.retryTimer = setTimeout(() => { this.refresh() }, delay)
  }

  private async sync(): Promise<void> {
    const rows = await this.baseRows()
    if (this.stopped()) return
    const session = await this.ctx.mindeckAccount.session()
    if (this.stopped()) return
    this.cache ??= await readCache(this.cacheFile)
    if (this.stopped()) return
    const signedIn: EmployeeOwner | undefined = session === undefined
      ? undefined
      : { cloudUrl: session.cloudUrl, userId: session.bootstrap.user.id }
    // Signing out keeps the registered employees; at startup they are the last member's.
    const owner = signedIn ?? this.owner ?? this.cache.last
    // The cache registers before Mindeck Cloud answers, and another member's presets leave with that member.
    await this.apply(rows, owner, owner === null ? [] : employeesOf(this.cache, owner))
    if (session === undefined || signedIn === undefined || this.stopped()) return
    if (!sameOwner(signedIn, this.cache.last)) await this.save(withOwner(this.cache, signedIn))
    const url = session.bootstrap.endpoints.employees
    if (url === undefined) return
    using limit = deadline(this.lifetime.signal, this.config.requestTimeoutMs, 'MINDECK_EMPLOYEES_TIMEOUT')
    const listing = await fetchEmployees(url, session.token, limit.signal)
    if (this.stopped()) return
    if (listing === 'sign-in-required') { await this.ctx.mindeckAccount.rejectToken(session.token); return }
    if (listing.skipped > 0) {
      this.ctx.logger.warn(`mindeck-employees: skipped ${listing.skipped} digital employees in an unknown format`)
    }
    // A sign-in or sign-out during the request requests its own refresh, which applies the account now stored.
    if ((await this.ctx.mindeckAccount.session())?.token !== session.token || this.stopped()) return
    const employees = mergeListing(employeesOf(this.cache, signedIn), listing.employees)
    await this.save(withOwner(this.cache, signedIn, employees))
    if (this.stopped()) return
    await this.apply(rows, signedIn, employees)
  }

  /**
   * Keep the cache in memory and on disk. A failed write keeps the registrations; the next listing from Mindeck Cloud
   * is written again.
   */
  private async save(cache: EmployeeCache): Promise<void> {
    this.cache = cache
    await writeCache(this.cacheFile, cache).catch((error: unknown) => {
      this.ctx.logger.warn('mindeck-employees: could not save the digital employees for the next start', error)
    })
  }

  /**
   * Read the base preset's plugin rows, `!!js` conditions included. The base preset's own row may still be
   * activating when this plugin starts, so a missing base waits once for the Host composition to settle.
   * @returns the rows.
   * @throws Error when the base preset is not registered or its rows are not a plugin list.
   */
  private async baseRows(): Promise<PresetRows> {
    const id = this.config.basePreset
    const read = () => this.ctx.agentPresets.readDocument(id)
    let preset: AgentPresetDocument
    try { preset = await read() }
    catch (error) {
      if (!(error instanceof RemoteError) || error.code !== 'agent-preset/not-found') throw error
      await this.settled()
      if (this.stopped()) throw error
      preset = await read()
    }
    const rows: unknown = load(preset.content, { schema: entryListSchema })
    const problem = entryListProblem(rows)
    if (problem !== undefined) throw new Error(`mindeck-employees: base agent preset "${id}": ${problem}`)
    return rows as PresetRows
  }

  /** Wait until the Host Loader has no pending activation, or until this plugin stops. */
  private async settled(): Promise<void> {
    const loader = this.ctx.get('loader')
    if (loader === undefined) return
    const { signal } = this.lifetime
    const stop = Promise.withResolvers<void>()
    const onAbort = (): void => { stop.resolve() }
    signal.addEventListener('abort', onAbort, { once: true })
    try { await Promise.race([loader.await(), stop.promise]) }
    finally { signal.removeEventListener('abort', onAbort) }
  }

  /**
   * Register the general assistant and one member's employees, replacing only presets whose definition changed and
   * removing the rest, then publish the cards.
   * @param rows - the base preset's rows.
   * @param owner - the member, or null when no member is known yet.
   * @param employees - the member's employees, current ones first.
   */
  private async apply(rows: PresetRows, owner: EmployeeOwner | null, employees: readonly CachedEmployee[]): Promise<void> {
    const wanted = new Map<string, PresetDefinition>([[GENERAL_PRESET_ID, generalDefinition(rows, this.config.generalPersona)]])
    employees.forEach((employee, index) => { wanted.set(employeePresetId(employee.id), employeeDefinition(rows, employee, index)) })
    for (const [id, registration] of [...this.registrations]) {
      if (wanted.has(id)) continue
      this.registrations.delete(id)
      await registration.dispose()
    }
    for (const definition of wanted.values()) {
      if (this.stopped()) return
      const current = this.registrations.get(definition.id)
      if (current !== undefined && deepEqualJson(current.definition, definition)) continue
      // The registry refuses a second definition under one id, so the previous one leaves first.
      if (current !== undefined) { this.registrations.delete(definition.id); await current.dispose() }
      try {
        const dispose = await this.ctx.agentPresets.register(definition)
        this.registrations.set(definition.id, { definition, dispose })
      } catch (error) {
        this.ctx.logger.warn(`mindeck-employees: could not register agent preset "${definition.id}"`, error)
      }
    }
    this.owner = owner
    this.employeesByPreset = new Map(employees.map(employee => [employeePresetId(employee.id), employee]))
    this.shown = employees
    await this.publishCards()
  }

  /** Publish the cards of the registered presets, naming each default model the company catalog lists. */
  private async publishCards(): Promise<void> {
    const revision = ++this.cardsRevision
    const employees = this.shown
    const models = employees.some(employee => employee.defaultModel !== null) ? await this.companyModels() : new Map()
    // A later publication read newer employees or models.
    if (revision !== this.cardsRevision || this.stopped()) return
    const cards: MindeckEmployeeCard[] = []
    if (this.registrations.has(GENERAL_PRESET_ID)) cards.push(GENERAL_CARD)
    for (const employee of employees) {
      const presetId = employeePresetId(employee.id)
      if (employee.retired || !this.registrations.has(presetId)) continue
      const { id: employeeId, name, avatar, tagline, starters, draft, defaultModel } = employee
      const folders = employee.folders.map(({ label, path, accessible }) => ({ label, path, accessible }))
      const model = defaultModel === null ? null : models.get(defaultModel)?.name ?? null
      cards.push({ kind: 'employee', presetId, employeeId, name, avatar, tagline, starters, draft, folders, model })
    }
    this.catalog.publish({ cards })
  }

  /**
   * Read the company models the configured providers list.
   * @returns each model id with its provider and display name; the first provider listing an id wins.
   */
  private async companyModels(): Promise<ReadonlyMap<string, { readonly provider: string; readonly name: string }>> {
    const found = new Map<string, { readonly provider: string; readonly name: string }>()
    const llm = this.ctx.get('llm')
    if (llm === undefined) return found
    const registered = new Set(llm.listProviders().map(provider => provider.id))
    for (const provider of this.config.modelProviders) {
      if (!registered.has(provider)) continue
      let models
      try { models = await llm.listModels(provider) }
      catch (error) {
        this.ctx.logger.warn(`mindeck-employees: could not list the models of "${provider}"`, error)
        continue
      }
      for (const model of models) if (!found.has(model.id)) found.set(model.id, { provider, name: model.name })
    }
    return found
  }

  /**
   * Choose the model of a blank conversation after its preset is set: an employee's default model when the company
   * catalog lists it; for a preset without one, the deployment default again when the conversation still runs the
   * default model this plugin chose. Choices for one conversation apply in order.
   * @param agent - the conversation's Agent.
   */
  private async chooseModel(agent: Agent): Promise<void> {
    const previous = this.choosing.get(agent) ?? Promise.resolve()
    const next = previous.then(() => this.chooseModelNow(agent)).catch((error: unknown) => {
      this.ctx.logger.warn('mindeck-employees: could not choose the conversation\'s model', error)
    })
    this.choosing.set(agent, next)
    await next
  }

  private async chooseModelNow(agent: Agent): Promise<void> {
    // A preset selection notifies listeners while it is being appended; the model choice is appended after it.
    await Promise.resolve()
    if (this.stopped() || !this.blank(agent)) return
    const preset = this.ctx.agentPresets.presetForSession(agent.session)
    const employee = preset === null ? undefined : this.employeesByPreset.get(preset)
    const chosen = this.chosen.get(agent)
    if (employee === undefined || employee.retired || employee.defaultModel === null) {
      if (chosen === undefined) return
      this.chosen.delete(agent)
      const current = agent.model.current()
      const defaults = this.ctx.get('agentDefaultModel')?.currentSelection()
      if (defaults !== undefined && current?.provider === chosen.provider && current.model === chosen.model) {
        agent.model.select({ provider: defaults.provider, model: defaults.model })
      }
      return
    }
    const route = (await this.companyModels()).get(employee.defaultModel)
    if (this.stopped() || !this.blank(agent)) return
    if (route === undefined) {
      this.ctx.logger.warn(`mindeck-employees: "${employee.name}" names default model "${employee.defaultModel}", which the company models do not list; the conversation keeps its model`)
      return
    }
    const selection = { provider: route.provider, model: employee.defaultModel }
    agent.model.select(selection)
    this.chosen.set(agent, selection)
  }

  /** Whether no turn of the conversation has started, so its preset and model are still open. */
  private blank(agent: Agent): boolean {
    const boundary = this.ctx.get('agents')?.turnBoundaryOf(agent.session)
    return boundary !== undefined && boundary.openTurnStartSeq === null && boundary.lastTurn === 0
  }
}
