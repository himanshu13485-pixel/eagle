import { CONTACT } from "../lib/site";
import { Clause, LegalPage } from "../components/Legal";

export default function ResponsibleUse() {
  return (
    <LegalPage
      title="Responsible use"
      summary="Monitoring software is easy to misuse. This is the line we draw, what we built to keep you on the right side of it, and what we will not help with."
    >
      <Clause n="01" title="What Workk is for">
        <p>
          Workk is workforce-visibility software for employer-owned devices, in the same category
          as Hubstaff, Time Doctor or ActivTrak. It is for organisations that want an accurate
          record of work done on their own equipment, and are willing to tell their staff that the
          record exists.
        </p>
      </Clause>

      <Clause n="02" title="The boundary, in product terms">
        <p>Some limits are policy. These ones are built in, so they hold whether or not anyone is watching:</p>
        <ul>
          <li><strong>No keystroke logging.</strong> The agent contains no keylogger. Passwords typed on a monitored machine are not captured as text.</li>
          <li><strong>No audio.</strong> The agent does not record the microphone.</li>
          <li><strong>No silent enrolment.</strong> A device joins an organisation only with a token an administrator generated and someone installed deliberately.</li>
          <li><strong>Retention expires.</strong> Screenshots and activity age out on a schedule, enforced nightly. There is no &ldquo;keep forever&rdquo; setting.</li>
          <li><strong>Employees can see their own data.</strong> Self-reporting can be switched on so the measured party sees the same numbers as the manager.</li>
        </ul>
      </Clause>

      <Clause n="03" title="Hidden mode">
        <p>
          Professional and Business plans include a restricted mode where the agent does not show a
          tray indicator. It exists because some organisations are legally required to monitor
          without an on-screen prompt influencing behaviour — regulated trading floors, for
          instance.
        </p>
        <p>
          <strong>Hidden mode is not permission to monitor secretly.</strong> Disclosure is still
          required, in writing, before monitoring begins. Removing the indicator does not remove
          the obligation, and in most jurisdictions covert monitoring of employees is unlawful.
        </p>
      </Clause>

      <Clause n="04" title="What we will not support">
        <p>We terminate accounts, without refund, where Workk is used to monitor:</p>
        <ul>
          <li>A partner, spouse, family member, or child.</li>
          <li>A person&rsquo;s own personal device without their informed, freely-given consent.</li>
          <li>Anyone who has not been told the monitoring is happening, where the law requires they be told.</li>
          <li>Journalists, activists, or individuals for the purpose of suppressing lawful activity.</li>
          <li>Union organising, or any activity protected by employment or labour law.</li>
        </ul>
        <p>
          If you contact support asking how to hide Workk from the person using the machine, we will
          not help, and we will look at the account.
        </p>
      </Clause>

      <Clause n="05" title="Getting it right with your team">
        <p>What good deployments have in common, in our experience:</p>
        <ul>
          <li>Monitoring is announced before it starts, in writing, with the reason stated.</li>
          <li>People know the interval, the retention window, and who can see the data.</li>
          <li>Working hours are configured, so nothing is captured outside them.</li>
          <li>The data is used to settle questions of fact, not to rank people by minutes.</li>
          <li>Employees can see their own reports.</li>
        </ul>
        <p>
          Teams that skip the announcement generate more disputes than the software resolves. The
          product works better when nobody has to wonder.
        </p>
      </Clause>

      <Clause n="06" title="Reporting misuse">
        <p>
          If you believe an Workk account is being used against these rules — including if you are
          the person being monitored — contact{" "}
          <a href={`mailto:${CONTACT.privacy}`} className="font-semibold text-goldDeep hover:underline">
            {CONTACT.privacy}
          </a>
          . We investigate every report, and we do not disclose the reporter to the account holder.
        </p>
      </Clause>
    </LegalPage>
  );
}
