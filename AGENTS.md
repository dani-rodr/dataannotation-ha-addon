# DataAnnotation Add-on Instructions

- Treat live DataAnnotation tests as read-only.
- Do not call `withdrawAvailableFunds()` from live tests unless the user explicitly requests a real withdrawal test.
- Do not click project rows, start/open task buttons, star, hide, share, invite, or refer controls.
- The only allowed browser action in the default flow is login form submission.
- `Withdraw Funds` must stay behind the `Withdraw Locked` guard and only click the exact `$x.xx available` button.
- Any future real-withdrawal test must be opt-in via an explicit environment variable.
