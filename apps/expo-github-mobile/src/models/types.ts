// MARK: - Repository

export interface Repository {
  id: string
  name: string
  owner: string
  defaultBranch: string
}

export const getFullName = (repo: Repository) => `${repo.owner}/${repo.name}`

export const mockRepositories: Repository[] = [
  { id: '1', name: 'clawdbot', owner: 'semihpolat', defaultBranch: 'main' },
  { id: '2', name: 'systemss', owner: 'semihpolat', defaultBranch: 'main' },
  { id: '3', name: 'Awesome-Prompts', owner: 'semihpolat', defaultBranch: 'main' },
  { id: '4', name: 'statue', owner: 'semihpolat', defaultBranch: 'main' },
  { id: '5', name: 'littleagents', owner: 'semihpolat', defaultBranch: 'main' },
  { id: '6', name: 'ultimateaiscraper', owner: 'semihpolat', defaultBranch: 'main' },
]

// MARK: - Session

export enum SessionStatus {
  Idle = 'Idle',
  Running = 'Running',
  Completed = 'Completed',
  Error = 'Error',
}

export interface Session {
  id: string
  title: string
  repository: Repository
  createdAt: Date
  status: SessionStatus
  messages: Message[]
}

// MARK: - Message

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: Date
  toolCalls: ToolCall[]
}

// MARK: - Tool Call

export enum ToolType {
  Write = 'Write',
  Bash = 'Bash',
  Read = 'Read',
  Edit = 'Edit',
  Glob = 'Glob',
  Grep = 'Grep',
}

export enum ToolCallStatus {
  Pending = 'pending',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

export interface ToolCall {
  id: string
  type: ToolType
  name: string
  input: string
  output?: string
  status: ToolCallStatus
}

// MARK: - AI Model

export interface AIModel {
  id: string
  name: string
  displayName: string
}

export const AIModels = {
  sonnet: { id: 'sonnet-4.5', name: 'sonnet', displayName: 'Sonnet 4.5' } as AIModel,
  opus: { id: 'opus-4.5', name: 'opus', displayName: 'Opus 4.5' } as AIModel,
  haiku: { id: 'haiku', name: 'haiku', displayName: 'Haiku' } as AIModel,
}

export const allModels = [AIModels.sonnet, AIModels.opus, AIModels.haiku]

// MARK: - Mock Data

const now = new Date()

export const mockSessions: Session[] = [
  {
    id: '1',
    title: 'Design Claude Code system architecture for mobile',
    repository: mockRepositories[1],
    createdAt: new Date(now.getTime() - 3600 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '2',
    title: 'Add popular tweets with images to platform showcase',
    repository: mockRepositories[2],
    createdAt: new Date(now.getTime() - 7200 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '3',
    title: 'Add popular tweets with images to platform library',
    repository: mockRepositories[2],
    createdAt: new Date(now.getTime() - 10800 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '4',
    title: 'Evaluate migrating SvelteKit project to Next.js',
    repository: mockRepositories[3],
    createdAt: new Date(now.getTime() - 14400 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '5',
    title: 'Update resources list with current tools and links',
    repository: mockRepositories[4],
    createdAt: new Date(now.getTime() - 18000 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '6',
    title: 'Sync fork with original repository',
    repository: mockRepositories[3],
    createdAt: new Date(now.getTime() - 21600 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
  {
    id: '7',
    title: 'Improve UI Design with Shadcn Style',
    repository: mockRepositories[5],
    createdAt: new Date(now.getTime() - 25200 * 1000),
    status: SessionStatus.Idle,
    messages: [],
  },
]

export const mockActiveSession: Session = {
  id: 'active-1',
  title: 'Add popular tweets with images to platform',
  repository: mockRepositories[2],
  createdAt: new Date(now.getTime() - 1800 * 1000),
  status: SessionStatus.Running,
  messages: [
    {
      id: 'm1',
      role: MessageRole.Assistant,
      content: 'Haklisın, hemen README.md\'yi oluşturup push yapıyorum!',
      timestamp: new Date(now.getTime() - 1200 * 1000),
      toolCalls: [
        {
          id: 'tc1',
          type: ToolType.Write,
          name: 'Write',
          input: '/home/user/Awesome-Prompts/README.md',
          output: `+ # Awesome AI Prompts
+
+ A curated collection of powerful AI prompts that went viral on X/Twitter.
+ These prompts have been battle-tested by thousands of users and proven to deliver
+ exceptional results with ChatGPT, Claude, and other LLMs.
+`,
          status: ToolCallStatus.Completed,
        },
      ],
    },
    {
      id: 'm2',
      role: MessageRole.Assistant,
      content: 'Şimdi commit ve push yapıyorum:',
      timestamp: new Date(now.getTime() - 900 * 1000),
      toolCalls: [
        {
          id: 'tc2',
          type: ToolType.Bash,
          name: 'Bash',
          input: 'git add README.md && git status',
          status: ToolCallStatus.Completed,
        },
        {
          id: 'tc3',
          type: ToolType.Bash,
          name: 'Bash',
          input: `git commit -m "$(cat <<'EOF'
Add comprehensive Awesome AI Prompts collection...
EOF
)"`,
          status: ToolCallStatus.Completed,
        },
        {
          id: 'tc4',
          type: ToolType.Bash,
          name: 'Bash',
          input: 'git push -u origin claude/add-popular-tweets-dy04J',
          status: ToolCallStatus.Completed,
        },
      ],
    },
    {
      id: 'm3',
      role: MessageRole.Assistant,
      content: 'Push tamam! Şimdi PR oluşturuyorum:',
      timestamp: new Date(now.getTime() - 600 * 1000),
      toolCalls: [],
    },
  ],
}
