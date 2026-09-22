/**
 * A camera is different from a screenshot: enabling it lights up a recording LED
 * on the employee's machine and is a real privacy step. Every webcam toggle in
 * the app routes an *enable* through this, so turning it on is always deliberate.
 * Turning it OFF never prompts — making monitoring less invasive shouldn't have a
 * speed bump.
 *
 * `scope` tailors the wording (org-wide vs a selection vs one person).
 */
export function confirmWebcamEnable(scope: string): boolean {
  return window.confirm(
    `Turn on webcam photos for ${scope}?\n\n` +
      `This makes the agent take periodic snapshots from the built-in camera. ` +
      `On the employee's computer the camera's recording light will turn on for a moment each time. ` +
      `Only enable this if your team has been told and has agreed.\n\n` +
      `(Webcam capture is Windows-only and opt-in.)`,
  );
}

/**
 * Wrap a boolean setter so switching webcam ON asks first; OFF passes straight
 * through. Returns a handler you can drop in place of the raw onChange.
 */
export function guardWebcamToggle(scope: string, onChange: (v: boolean) => void): (v: boolean) => void {
  return (v: boolean) => {
    if (v && !confirmWebcamEnable(scope)) return; // declined — leave it off
    onChange(v);
  };
}
