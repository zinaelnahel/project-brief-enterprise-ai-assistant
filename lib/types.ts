export type Chunk = {
  id: string;
  source: string;
  page: number;
  department: string;
  historical: boolean;
  text: string;
};

export type Hit = Chunk & {score: number};
