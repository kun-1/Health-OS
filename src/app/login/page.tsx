import { LoginForm } from "@/components/login-form";

type Props = {
  searchParams: Promise<{ redirect?: string | string[] }>;
};

// Wave 3 auth: server component just unpacks ?redirect= and hands it to the
// client form. The middleware never redirects here when EXPENSES_PASSWORD is
// empty, so if you can reach this page you do need to log in.
export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const raw = Array.isArray(params.redirect) ? params.redirect[0] : params.redirect;
  // Wave 3 auth: only accept same-origin path redirects to avoid open-redirect
  // via the ?redirect= param.
  const safe = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/expenses";
  return <LoginForm redirect={safe} />;
}
