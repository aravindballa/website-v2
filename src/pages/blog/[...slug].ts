import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = ({ request, redirect }) => {
  const url = new URL(request.url);
  const suffix = url.pathname.slice("/blog".length);

  return redirect(`/writings${suffix}${url.search}`, 301);
};
