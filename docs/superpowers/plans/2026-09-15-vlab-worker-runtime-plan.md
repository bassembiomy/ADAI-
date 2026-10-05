# V-Lab Worker Runtime Plan

1. Add a typed worker protocol and worker implementation that executes the existing `VLabPhysicsEngine`.
2. Add a client with request sequencing, cancellation, disposal, and synchronous fallback.
3. Route VLab simulation steps through the client without changing model or solver inputs.
4. Add protocol/client regression tests.
5. Run V-Lab tests and the TypeScript build.
