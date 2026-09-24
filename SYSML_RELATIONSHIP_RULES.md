# SysML Relationship Rules

- Generalization is definition-level inheritance; reject cycles and resolve inherited features without cloning them.
- Association is definition-level; Connector is context/usage-level.
- Composition/shared aggregation are distinct ownership semantics.
- Requirement containment is ownership/decomposition and is distinct from deriveReqt, satisfy, verify, refine, trace, and copy.
- Connector ends resolve semantic properties/ports and may carry a nested property path.
- ItemFlow is independent information conveyed over a Connector/Association and references classifiers; it is not edge label text.
- BindingConnector expresses equality/binding and is not an InformationFlow.
- A relationship presentation may be deleted without deleting its semantic relationship.

