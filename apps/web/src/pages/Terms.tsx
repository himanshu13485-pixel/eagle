import { CONTACT } from "../lib/site";
import { Clause, LegalPage } from "../components/Legal";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of service"
      summary="The agreement between your organisation and us for use of Eagle. The short version: you may monitor your own devices, lawfully and with disclosure; we keep the service running and your data contained."
    >
      <Clause n="01" title="The agreement">
        <p>
          These terms are between <strong>[LEGAL ENTITY NAME]</strong> (&ldquo;we&rdquo;) and the
          organisation that creates an Eagle account (&ldquo;you&rdquo;). By creating an account or
          installing the agent, you accept them. If you are agreeing on behalf of a company, you
          confirm you are authorised to bind it.
        </p>
      </Clause>

      <Clause n="02" title="What you may use Eagle for">
        <p>Eagle is licensed for monitoring devices that your organisation owns or lawfully controls, used by people who work for you. You agree that you will:</p>
        <ul>
          <li>Disclose the monitoring to everyone subject to it, before it begins.</li>
          <li>Establish a lawful basis for the monitoring in every jurisdiction where your staff work, and keep records of it.</li>
          <li>Obtain consent where the law of that jurisdiction requires consent.</li>
          <li>Configure capture intervals and retention proportionately to the purpose.</li>
        </ul>
        <p>
          Compliance is your responsibility. We provide controls that make lawful use practical; we
          cannot determine what is lawful in your jurisdiction or for your workforce.
        </p>
      </Clause>

      <Clause n="03" title="What you may not use it for">
        <ul>
          <li>Monitoring devices you do not own or control, or people who do not work for you.</li>
          <li>Covert surveillance of individuals where disclosure is required by law.</li>
          <li>Monitoring a person&rsquo;s personal device without their informed, freely-given consent.</li>
          <li>Stalking, harassment, or monitoring of family members, partners, or minors.</li>
          <li>Discrimination, or decisions that breach employment law in your jurisdiction.</li>
          <li>Reselling, sublicensing, or reverse-engineering the service or the agent.</li>
        </ul>
        <p>
          <strong>We terminate accounts for these breaches without refund</strong>, and where the law
          requires it, we report them.
        </p>
      </Clause>

      <Clause n="04" title="Accounts and security">
        <p>
          You are responsible for the confidentiality of credentials, for the actions of your
          administrators, and for removing access when someone leaves. Enrolment tokens should be
          treated as secrets — anyone holding one can attach a device to your organisation.
        </p>
      </Clause>

      <Clause n="05" title="Plans, billing, and trials">
        <ul>
          <li>Trials run 14 days with no card required. At the end, the account pauses unless you select a plan.</li>
          <li>Paid plans are charged per monitored seat, per month, in advance, in USD.</li>
          <li>Seats freed by deactivating an employee are reflected at the next billing cycle.</li>
          <li>Downgrades apply the new plan&rsquo;s retention window from the day they take effect, which may delete existing captures. Export first.</li>
          <li>Fees are non-refundable except where required by law.</li>
          <li>We may change prices with 30 days&rsquo; notice to account administrators; changes never apply mid-term.</li>
        </ul>
      </Clause>

      <Clause n="06" title="Your data">
        <p>
          The data Eagle captures is yours. We process it to provide the service, as described in
          the <a href="/privacy" className="font-semibold text-goldDeep hover:underline">privacy policy</a>.
          We do not sell it, and we do not use it to train models.
        </p>
        <p>
          On termination you may export your data for <strong>30 days</strong>, after which it is
          deleted. Retention windows continue to apply throughout — captures already aged out are
          gone and cannot be recovered.
        </p>
      </Clause>

      <Clause n="07" title="Availability">
        <p>
          We aim for high availability but do not offer a contractual uptime guarantee on standard
          plans. Maintenance is scheduled outside business hours where practical. The agent buffers
          locally when the service is unreachable and replays when it returns, so short outages do
          not lose data.
        </p>
      </Clause>

      <Clause n="08" title="The agent software">
        <p>
          The agent is licensed, not sold, for use on your enrolled devices for the term of your
          subscription. Current builds are unsigned, so operating systems may warn on install. You
          may not redistribute or modify it.
        </p>
      </Clause>

      <Clause n="09" title="Liability">
        <p>
          The service is provided &ldquo;as is&rdquo; to the extent permitted by law. We are not
          liable for indirect or consequential loss, lost profits, or loss of data beyond our
          reasonable control. Our total liability in any twelve-month period is limited to the fees
          you paid in that period.
        </p>
        <p>
          <strong>You indemnify us</strong> against claims arising from your use of Eagle in breach
          of clause 2 or 3 — including claims brought by your own staff where you failed to
          disclose monitoring or to establish a lawful basis.
        </p>
      </Clause>

      <Clause n="10" title="Termination">
        <p>
          You may cancel at any time, effective at the end of the paid period. We may suspend or
          terminate for non-payment, or immediately for a breach of clause 3. We may terminate for
          convenience with 30 days&rsquo; notice and a pro-rata refund.
        </p>
      </Clause>

      <Clause n="11" title="Governing law and contact">
        <p>
          These terms are governed by the laws of <strong>[JURISDICTION]</strong>, and the courts of{" "}
          <strong>[VENUE]</strong> have exclusive jurisdiction.
        </p>
        <p>
          Questions:{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-goldDeep hover:underline">
            {CONTACT.email}
          </a>
          , or {CONTACT.phone}.
        </p>
      </Clause>
    </LegalPage>
  );
}
