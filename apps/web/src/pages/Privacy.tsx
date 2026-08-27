import { CONTACT } from "../lib/site";
import { Clause, LegalPage } from "../components/Legal";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      summary="What Workk collects, who controls it, how long it is kept, and how to get it removed. Written for two audiences: the organisation that buys Workk, and the people whose work it records."
    >
      <Clause n="01" title="Who controls the data">
        <p>
          Workk is supplied by <strong>[LEGAL ENTITY NAME]</strong>, registered at{" "}
          <strong>[REGISTERED ADDRESS]</strong> (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>
          For monitoring data captured from enrolled devices, the <strong>employer</strong> is the
          data controller and we are the processor. The employer decides who is monitored, at what
          interval, and for what purpose. We process it on their instructions to provide the
          service.
        </p>
        <p>
          For account and billing data — the person who signs up, their email, invoices — we are
          the controller.
        </p>
      </Clause>

      <Clause n="02" title="What we collect from monitored devices">
        <p>Only when an administrator has enrolled the device with a token issued from their dashboard:</p>
        <ul>
          <li>Screenshots, at the interval configured by the employer, plus captures on application switch.</li>
          <li>Application and window titles, and website domains visited.</li>
          <li>Active and idle time derived from input activity.</li>
          <li>Live screen frames, only while a manager has a live session open.</li>
          <li>Device identifiers, operating system, and agent version.</li>
          <li>Webcam images, only where the employer has enabled that add-on.</li>
        </ul>
        <p>
          <strong>We do not collect keystrokes.</strong> There is no keylogger in the agent. We do
          not record audio, and we do not read the contents of email or messaging applications
          beyond what is visible in a screenshot of the screen.
        </p>
      </Clause>

      <Clause n="03" title="What we collect from the website and dashboard">
        <ul>
          <li>Account details: name, work email, company, and password (stored hashed, never in plain text).</li>
          <li>Anything you type into the contact form on this site, used only to reply to you.</li>
          <li>Billing records, where a paid plan is active. Card details are handled by our payment provider and never reach our servers.</li>
          <li>Standard server logs, including IP address, for security and diagnostics.</li>
        </ul>
      </Clause>

      <Clause n="04" title="Why we process it">
        <ul>
          <li><strong>To provide the service</strong> — capture, storage, and reporting the employer has configured.</li>
          <li><strong>Legitimate interests of the employer</strong> — managing work on employer-owned equipment. The employer is responsible for establishing and documenting that basis, and for disclosing monitoring to staff.</li>
          <li><strong>Contract</strong> — billing and account administration.</li>
          <li><strong>Legal obligation</strong> — tax records and lawful requests.</li>
        </ul>
        <p>
          We do not sell personal data, and we do not use monitoring data to train models or for
          advertising.
        </p>
      </Clause>

      <Clause n="05" title="How long it is kept">
        <p>Retention runs automatically every night. Nothing is kept indefinitely by default.</p>
        <ul>
          <li>Screenshots: 15 days on Basic, 30 on Professional, 60 on Business.</li>
          <li>Activity logs: 90 days on Basic and Professional, 180 on Business.</li>
          <li>Account and billing records: for the life of the account, then as required for tax and accounting.</li>
        </ul>
        <p>
          If an organisation downgrades, the shorter window applies from that day and older
          captures are removed at the next nightly run.
        </p>
      </Clause>

      <Clause n="06" title="Who else sees it">
        <ul>
          <li><strong>Inside the employer</strong> — administrators, and managers or team leads for their own teams.</li>
          <li><strong>Our staff</strong> — only where necessary to operate or support the service, and only with the customer&rsquo;s knowledge.</li>
          <li><strong>Infrastructure providers</strong> — hosting and email delivery, acting as sub-processors under contract.</li>
          <li><strong>Payment provider</strong> — for plan payments.</li>
        </ul>
        <p>We do not disclose monitoring data to third parties except where legally compelled.</p>
      </Clause>

      <Clause n="07" title="Security">
        <p>
          Data is encrypted in transit. Screenshots are stored with AES-256 encryption at rest.
          Access to production systems is restricted and authenticated. Device enrolment requires a
          signed token, so an agent cannot attach itself to an organisation it was not issued for.
        </p>
        <p>
          No system is perfect. If we become aware of a breach affecting personal data, we notify
          affected customers without undue delay and, where required, the relevant supervisory
          authority.
        </p>
      </Clause>

      <Clause n="08" title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, delete, restrict,
          or object to processing of your personal data, and to receive a copy in portable form.
        </p>
        <p>
          <strong>If you are a monitored employee</strong>, your employer controls the data — please
          raise your request with them first. We will assist them in fulfilling it, and the
          dashboard provides bulk export and deletion for exactly this purpose. If you cannot get a
          response from your employer, contact us at{" "}
          <a href={`mailto:${CONTACT.privacy}`} className="font-semibold text-goldDeep hover:underline">
            {CONTACT.privacy}
          </a>{" "}
          and we will do what we can within our role as processor.
        </p>
        <p>You also have the right to complain to your local data protection authority.</p>
      </Clause>

      <Clause n="09" title="International transfers">
        <p>
          Our infrastructure is located in <strong>[HOSTING REGION]</strong>. Where data moves
          across borders, we rely on <strong>[TRANSFER MECHANISM — e.g. standard contractual clauses]</strong>.
        </p>
      </Clause>

      <Clause n="10" title="Changes and contact">
        <p>
          Material changes will be notified to account administrators by email before they take
          effect. Questions or requests:{" "}
          <a href={`mailto:${CONTACT.privacy}`} className="font-semibold text-goldDeep hover:underline">
            {CONTACT.privacy}
          </a>
          , or {CONTACT.phone}.
        </p>
      </Clause>
    </LegalPage>
  );
}
