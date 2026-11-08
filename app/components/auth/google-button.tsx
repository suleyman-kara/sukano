import { Form } from "react-router";
import { Button } from "~/components/ui/button";
import { AUTH_BUTTON } from "./fields";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z"
      />
      <path fill="#FBBC05" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9l3.3-2.5Z" />
      <path
        fill="#EA4335"
        d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.8 9.4 6 12 6Z"
      />
    </svg>
  );
}

/** Google ile giriş/kayıt: `/giris` action'ı Better Auth'tan yönlendirme adresini alır. */
export function GoogleButton({ label, next }: { label: string; next?: string }) {
  return (
    <Form method="post" action="/giris" replace>
      <input type="hidden" name="intent" value="google" />
      {next && next !== "/" && <input type="hidden" name="next" value={next} />}
      <Button
        variant="outline"
        type="submit"
        className={`${AUTH_BUTTON} gap-2.5 border-line bg-surface hover:bg-hover`}
      >
        <GoogleIcon />
        {label}
      </Button>
    </Form>
  );
}
