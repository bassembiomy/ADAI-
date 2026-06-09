import { Node, Edge } from 'reactflow';

export interface VLabWorkspaceProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (nodes: Node[]) => void;
  onEdgesChange: (edges: Edge[]) => void;
  onResult: (result: any, nodes: Node[]) => void;
  onSendToDOE: (data: any) => void;
  onBack: () => void;
  onSaveAll?: () => void;
  onNavigateToXbridges?: (targetBlockId?: string) => void;
  initialSelectedNodeId?: string | null;
}
