export interface DagBlock {
    hash: string;
    parents: string[];
    blueScore?: number;
    transactions?: { id: string, payload?: any }[];
    // Other fields can be appended as needed by the consumer
    [key: string]: any;
}

export interface DagNeighborhood {
    hash: string;
    ancestors: DagBlock[];
    descendants: DagBlock[];
}

export interface DagStatistics {
    totalBlocks: number;
    totalTips: number;
    highestBlueScore: number;
}
