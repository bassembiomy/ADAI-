import type { CreateNewTypeAction, TypeCandidate } from '../../engine/sysml/commands/commandResult';

export interface CreateNewTypeActionPromptProps {
  action: CreateNewTypeAction;
  candidates: TypeCandidate[];
  onCreate: (action: CreateNewTypeAction) => void;
  onDismiss: () => void;
}

export function CreateNewTypeActionPrompt({ action, candidates, onCreate, onDismiss }: CreateNewTypeActionPromptProps) {
  return (
    <div role="dialog" aria-labelledby="create-type-title" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4">
      <section className="w-full max-w-md rounded-lg border border-[#444] bg-[#171717] p-5 text-[#eee] shadow-xl">
        <h2 id="create-type-title" className="text-lg font-semibold">Type not found</h2>
        <p className="mt-2 text-sm text-[#bbb]">
          No existing type matches “{action.suggestedName}”. Choose an existing candidate or explicitly create a new type.
        </p>
        {candidates.length > 0 && (
          <ul aria-label="Candidate existing types" className="mt-3 space-y-1 text-sm">
            {candidates.map(candidate => <li key={candidate.id}>{candidate.qualifiedName} <span className="text-[#888]">({candidate.metaclass})</span></li>)}
          </ul>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onDismiss} className="rounded border border-[#444] px-3 py-2 text-sm">Cancel</button>
          <button type="button" onClick={() => onCreate(action)} className="rounded bg-orange-600 px-3 py-2 text-sm font-medium text-white">
            Create New Type
          </button>
        </div>
      </section>
    </div>
  );
}
