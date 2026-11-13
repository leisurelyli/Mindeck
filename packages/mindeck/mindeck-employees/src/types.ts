/** Digital-employee listing shared by the Host plugin and the new-conversation cards. */

/** The built-in general assistant, which Mindeck registers whether or not the member is signed in. */
export interface MindeckGeneralView {
  readonly kind: 'general'
  /** Agent preset the card selects. */
  readonly presetId: string
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
}

/** One card on the new-conversation screen. */
export type MindeckEmployeeCard = MindeckGeneralView | MindeckEmployeeView

/** The cards the new-conversation screen offers. */
export interface MindeckEmployeeCatalog {
  /** The general assistant first, then the company's current employees in Mindeck Cloud order; retired employees are left out. */
  readonly cards: readonly MindeckEmployeeCard[]
}
