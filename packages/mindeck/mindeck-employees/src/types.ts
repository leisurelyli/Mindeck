/** Digital-employee listing shared by the Host plugin and the digital-employee page. */

/** The built-in general assistant, which Mindeck registers whether or not the member is signed in. */
export interface MindeckGeneralView {
  readonly kind: 'general'
  /** Agent preset the card selects. */
  readonly presetId: string
}

/** One library folder a digital employee consults, as its card shows it. */
export interface MindeckEmployeeFolderView {
  /** Name the company gave the material, such as `企业制度`. */
  readonly label: string
  /** Space and folder names joined with ` / `, such as `企业空间 / 制度文件`. */
  readonly path: string
  /** Whether the member can open the folder; the employee finds nothing there for a member who cannot. */
  readonly accessible: boolean
}

/** One digital employee the company set up in Mindeck Cloud. */
export interface MindeckEmployeeView {
  readonly kind: 'employee'
  /** Agent preset the card selects. */
  readonly presetId: string
  /** Mindeck Cloud employee id. */
  readonly employeeId: string
  /** Job title the company gave the employee, such as `法务专员`. */
  readonly name: string
  /** Avatar key, such as `legal` or `neutral-2`; an unknown key shows the name's first character. */
  readonly avatar: string
  /** One line on what the employee helps with; may be empty. */
  readonly tagline: string
  /** Up to four example requests the member can put in the message box. */
  readonly starters: readonly string[]
  /** Whether only the administrator who created the employee sees it, to try it out. */
  readonly draft: boolean
  /** Library folders the employee consults before it answers. */
  readonly folders: readonly MindeckEmployeeFolderView[]
  /**
   * Name of the company model new conversations with the employee start on; null when the employee has none or the
   * model is not among the member's company models.
   */
  readonly model: string | null
}

/** One card on the digital-employee page. */
export type MindeckEmployeeCard = MindeckGeneralView | MindeckEmployeeView

/** The cards the digital-employee page offers. */
export interface MindeckEmployeeCatalog {
  /** The general assistant first, then the company's current employees in Mindeck Cloud order; retired employees are left out. */
  readonly cards: readonly MindeckEmployeeCard[]
}
