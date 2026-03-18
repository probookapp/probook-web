import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export default async function RootPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("NEXT_LOCALE")?.value || "en";
  const validLocale = locale === "fr" || locale === "ar" ? locale : "en";
  redirect(`/${validLocale}`);
}
