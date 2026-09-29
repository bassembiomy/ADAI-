# BDD Cameo-Style Connection Visuals Design

## Goal

Make BDD connections easy to distinguish visually while preserving SysML
semantics and Cameo-like relationship rules.

## Visual behavior

### Block to Block

- The relationship line starts and ends on Block borders.
- Association uses a solid line.
- Composition uses a filled diamond at the composite owner end.
- Shared aggregation uses a hollow diamond.
- Generalization uses a hollow triangle.
- Dependency and allocation use dashed directed lines.
- Relationship labels and multiplicities remain near their semantic ends.

### Property to Block

- The relationship line starts at the exact property row in the owning Block.
- The target remains attached to the target Block border.
- A small endpoint marker and property role/multiplicity label identify the
  property end.
- The relationship receives a distinct presentation token so it is visually
  distinguishable from a Block-to-Block Association without changing its
  semantic relationship kind.
- Hover and selection expose the property name, owner Block, and target type.

## Semantic rules

- Block-to-Block relationship creation is filtered through the central SysML
  connection policy before mutation.
- The UI offers only relationship kinds valid for the endpoint stereotypes and
  current BDD diagram.
- Association, aggregation, composition, and generalization rules are checked
  for endpoint compatibility, ownership, duplicate links, and cycles.
- A property-to-Block Association is accepted only when the target Block is the
  property's declared type.
- The persisted relationship keeps the property ID as its source endpoint;
  rendering resolves that property back to its owner Block for layout.
- Rejected gestures create no relationship or presentation record.

## Implementation boundaries

- Extend the existing BDD relationship geometry and renderer; do not create a
  second relationship model.
- Keep semantic relationship validation in the existing connection policy and
  command gateway.
- Add unit coverage for endpoint classification, visual route selection, and
  rejected relationship kinds.
- Add a browser regression covering Block-to-Block kind selection and
  property-to-Block direct creation and rendering.

## Acceptance criteria

1. A Block-to-Block Association is visibly distinct from composition,
   aggregation, generalization, dependency, and allocation.
2. A property-to-Block line visibly starts at the property row and carries a
   property-end marker/label.
3. Invalid relationship kinds are unavailable or rejected with a diagnostic.
4. Valid relationships persist with canonical SysML endpoints and reload with
   the same notation.
5. Existing BDD, IBD, and requirement relationship behavior remains intact.
