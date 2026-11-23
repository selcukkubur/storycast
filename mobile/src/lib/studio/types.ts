export type PlanBlock = { kind: "V" | "T"; text: string };

export type Plan = {
  title: string;
  subtitle: string;
  character: { name: string };
  blocks: PlanBlock[];
};

export type JobEvent = {
  t: number;
  stage: string;
  msg: string;
  images?: string[];
  videos?: string[];
  plan?: Plan;
};
