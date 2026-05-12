import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Routes the user must be signed in to reach. The home page and reader
// stay open; sessions and event ingest require auth.
const isProtectedRoute = createRouteMatcher(['/api/sessions(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static assets.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run on API routes.
    '/(api|trpc)(.*)',
  ],
};
