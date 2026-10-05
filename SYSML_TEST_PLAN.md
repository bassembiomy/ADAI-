# SysML Test Plan

Current baseline: 52 files / 513 tests passed with `npm run test:sysml -- --reporter=dot`.

Add semantic tests for: one definition/multiple usages; multi-diagram presentation reuse; delete presentation versus delete model; rename propagation; deletion impact for typed parts; explicit type creation workflow; ProxyPort/InterfaceBlock references; conjugation and nested direction; connector-end path resolution; ItemFlow classifier references; Association versus Connector; BindingConnector; inheritance cycle rejection; multiplicity/value specifications; requirement ID uniqueness; containment versus deriveReqt; unknown-type rejection; repository round-trip and migration; canonical repository versus UI projection parity.

