import { CONTACT } from "../lib/site";
import { Accent, Container, Eyebrow } from "../components/ui";
import { PageHead } from "../components/PageHead";

// Served by the API on the same origin, so it works over http and https alike.
const UNINSTALLER_URL = "/api/agent/uninstaller";

const STEPS = [
  ["Download the uninstaller", "It is a small .bat script — the button below saves Eagle_Uninstaller.bat to your Downloads folder."],
  ["Run it as administrator", "Right-click the file and choose Run as administrator. It will ask for elevation, which it needs to undo the install."],
  ["Let it finish", "It stops the agent, removes the scheduled task and the Defender exclusion, deletes the agent files, and frees the seat on the server. It closes on its own."],
];

export default function Uninstall() {
  return (
    <>
      <PageHead
        eyebrow="Uninstall"
        title={<>Remove the Eagle agent <Accent>from a PC</Accent>.</>}
        lede="This fully removes the monitoring agent from a Windows machine and releases its seat. It takes a few seconds and needs administrator rights."
      />

      <section className="bg-paper py-16 md:py-24">
        <Container>
          <div className="grid gap-14 md:grid-cols-[1.2fr_0.8fr]">
            <div>
              <Eyebrow index="01">How to remove it</Eyebrow>
              <ol className="mt-8 space-y-0">
                {STEPS.map(([title, body], i) => (
                  <li key={title} className="hairline flex gap-5 py-6 first:border-t-0 first:pt-0">
                    <span className="tnum font-display text-2xl text-gold">{String(i + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="font-display text-xl">{title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-inkSoft">{body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <a
                href={UNINSTALLER_URL}
                className="mt-10 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-sm font-semibold text-paper transition hover:bg-black"
              >
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" />
                </svg>
                Download uninstaller
              </a>
              <p className="mt-3 text-xs text-inkSoft">
                Windows only · Eagle_Uninstaller.bat · run as administrator
              </p>
            </div>

            <aside className="space-y-8">
              <div className="rounded-2xl border border-rule bg-paperAlt p-6">
                <Eyebrow index="02">Good to know</Eyebrow>
                <ul className="mt-5 space-y-4 text-sm leading-relaxed text-inkSoft">
                  <li>
                    <strong className="text-ink">SmartScreen may warn.</strong> The script is
                    unsigned. Choose <em>More info → Run anyway</em> if Windows prompts.
                  </li>
                  <li>
                    <strong className="text-ink">It frees the seat.</strong> The device is
                    deactivated on the server, so it stops counting toward your plan — history is
                    kept.
                  </li>
                  <li>
                    <strong className="text-ink">Managing a whole team?</strong> The dashboard has a
                    per-employee uninstaller under <em>Employees</em> that names the file per person.
                  </li>
                </ul>
              </div>
              <div className="hairline pt-6">
                <p className="text-sm leading-relaxed text-inkSoft">
                  Stuck, or the file will not run? Email{" "}
                  <a href={`mailto:${CONTACT.email}`} className="font-semibold text-goldDeep hover:underline">
                    {CONTACT.email}
                  </a>{" "}
                  or call{" "}
                  <a href={CONTACT.phoneHref} className="font-semibold text-goldDeep hover:underline">
                    {CONTACT.phone}
                  </a>
                  .
                </p>
              </div>
            </aside>
          </div>
        </Container>
      </section>
    </>
  );
}
