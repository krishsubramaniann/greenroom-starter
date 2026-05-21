export default function NotFound() {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <div className="text-[10.5px] uppercase tracking-wider text-ink-500 font-medium">
          Greenroom · magic link
        </div>
        <h1 className="text-[28px] font-display text-ink-900">
          Link not found
        </h1>
        <p className="text-[13px] text-ink-600">
          This share link is invalid or has been revoked. If you reached this
          page from an email, ask the booker to resend the link.
        </p>
      </div>
    </div>
  );
}
