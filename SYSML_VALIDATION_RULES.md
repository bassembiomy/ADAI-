# SysML Validation Rules

Existing rules are in `src/engine/sysml/validation.ts`, `bdd.ts`, `ibd.ts`, and `connectionPolicy.ts`.

Required target rules: unique semantic IDs and requirement IDs; valid owner/type references; no inheritance cycles; legal relationship endpoints; valid multiplicities; valid connector context and nested paths; port compatibility after conjugation; no unknown types synthesized; no duplicate definition on display; no deletion of typed definitions without impact handling; ItemFlow conveyed item existence; requirement relationship direction and endpoint legality; presentation references must resolve but presentation deletion must not cascade semantic deletion.

