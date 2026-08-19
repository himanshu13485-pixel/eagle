import { Button, Container } from "../components/ui";

export default function NotFound() {
  return (
    <Container className="py-28 text-center md:py-40">
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-5 font-display text-d2">This page isn&rsquo;t here.</h1>
      <p className="mx-auto mt-5 max-w-md text-inkSoft">
        The link may be old, or the address mistyped. Everything else is still where you left it.
      </p>
      <div className="mt-9 flex flex-wrap justify-center gap-4">
        <Button to="/">Back to home</Button>
        <Button to="/contact" variant="outline">Contact us</Button>
      </div>
    </Container>
  );
}
