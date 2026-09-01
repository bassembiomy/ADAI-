import { Node, Edge } from '@xyflow/react';

export type VLabNode = Node<Record<string, any>>;
export type VLabEdge = Edge<Record<string, any>>;

export interface VLabWorkspaceProps {
  nodes: VLabNode[];
  edges: VLabEdge[];
  onNodesChange: (nodes: VLabNode[]) => void;
  onEdgesChange: (edges: VLabEdge[]) => void;
  onResult: (result: any, nodes: VLabNode[]) => void;
  onSendToDOE: (data: any) => void;
  onBack: () => void;
  onSaveAll?: () => void;
  onNavigateToXbridges?: (targetBlockId?: string) => void;
  initialSelectedNodeId?: string | null;
}
