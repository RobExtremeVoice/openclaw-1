# SDD Workflow Guide for AI Agents

## 📝 File Organization Rules

### ⚠️ CRITICAL RULE: Where to Create Files

**✅ DO CREATE files in:**
```
docs/sdd/<feature-name>/
```

**❌ DO NOT CREATE files in:**
```
.flows/sdd_flow_by_codex/   # This is for templates ONLY
```

**❌ DO NOT CREATE files in:**
```
random-directories/         # Keep everything organized
```

---

## 📁 Directory Structure Convention

Each feature SDD should live in its own directory:

```
docs/sdd/
└── <feature-name-in-kebab-case>/
    ├── README.md                      # Project overview (Card 10)
    ├── raw-requirements.md            # Initial requirements
    ├── requirements.md                # Functional requirements (FRs)
    ├── ui-flow.md                     # User journeys & diagrams
    ├── keyword-detection.md           # Detection patterns (if applicable)
    ├── gaps.md                        # Gap analysis & decisions
    ├── manual-e2e-test.md             # Test cases
    ├── SDD_COMPLETION_SUMMARY.md      # Summary when done
    └── trello-cards/
        ├── BOARD.md                   # Board overview
        ├── KICKOFF.md                 # AI Agent guide
        ├── 01-*.md through 12-*.md   # 12 implementation cards
        └── AI_AGENT_TOOLS.md          # Tool usage guide (if tools created)
```

**Example:**
```
docs/sdd/web-search-via-gemini-cli/
docs/sdd/auto-archive-conversations/
docs/sdd/brave-search-integration/
```

---

## 🎯 SDD Generation Workflow

### Phase 1: Requirements Gathering

**Input:** Raw requirements from user

**Files to create:**
```bash
cd docs/sdd/web-search-via-gemini-cli/

# User provides requirements
cat > raw-requirements.md << 'EOF'
# Feature: Web Search via Gemini CLI

## Description
[User's raw requirements...]
EOF
```

### Phase 2: Project Analysis & Gap Interview (AI Agent)

**Files to create:**
```bash
# Create after analyzing project
cat > project-analysis.md << 'EOF'
# Project Analysis: Web Search

## Existing Patterns
- Deep research structure in src/deep-research/
- Skills system patterns in skills/brave-search/
- Zod config patterns in src/config/config.ts
...
EOF

# Create after gap interview
cat > gaps.md << 'EOF'
# Gap Analysis: Web Search

## Filled Gaps
Gap-001: Project Structure → ✅ Filled (100% confidence)
...

## Pending Gaps
Gap-011: Detection Threshold → 🔶 PENDING
...
EOF
```

### Phase 3: SDD Structure Generation

**Files to create (use templates from .flows/sdd_flow_by_codex/):**

```bash
# Use templates as starting point
TEMPLATES_DIR="/home/almaz/zoo_flow/clawdis/.flows/sdd_flow_by_codex/TEMPLATES"

# Create requirements.md (use template)
cp $TEMPLATES_DIR/09_REQUIREMENTS_TEMPLATE.md requirements.md
# Then edit to match your feature

# Create ui-flow.md (use template)
cp $TEMPLATES_DIR/10_UI_FLOW_TEMPLATE.md ui-flow.md
# Then edit with your use cases

# Create keyword-detection.md (if needed)
cp $TEMPLATES_DIR/11_DOMAIN_SPEC_TEMPLATE.md keyword-detection.md
# Then add detection patterns

# Create manual-e2e-test.md (use template)
cp $TEMPLATES_DIR/13_MANUAL_E2E_TEMPLATE.md manual-e2e-test.md
# Then add test cases
```

### Phase 4: Trello Card Generation

**Create execution cards in trello-cards/:**

```bash
mkdir -p trello-cards

# Create BOARD.md (overview)
cp /home/almaz/zoo_flow/clawdis/.flows/sdd_flow_by_codex/TRELLO_TEMPLATES/15_BOARD_TEMPLATE.md trello-cards/BOARD.md
# Edit with your card details

# Create KICKOFF.md (AI Agent guide)
cp /home/almaz/zoo_flow/clawdis/.flows/sdd_flow_by_codex/TEMPLATES/06_KICKOFF_TEMPLATE.md trello-cards/KICKOFF.md
# Edit with project-specific instructions

# Create cards 01-12 (use card templates)
# Each card should be executable by AI agent
```

---

## 🔧 Tools for SDD Generation

**Use existing SDD Flow tools:**

```bash
cd /home/almaz/zoo_flow/clawdis/.flows/sdd_flow_by_codex

# List available templates
ls TEMPLATES/
ls TRELLO_TEMPLATES/

# Review main flow
cat README.md

# Quick start for new SDD
cat AI_AGENT_QUICK_START.md
```

**Templates to use:**
- `TEMPLATES/09_REQUIREMENTS_TEMPLATE.md` → requirements.md
- `TEMPLATES/10_UI_FLOW_TEMPLATE.md` → ui-flow.md
- `TEMPLATES/11_DOMAIN_SPEC_TEMPLATE.md` → keyword-detection.md
- `TEMPLATES/12_GAPS_TEMPLATE.md` → gaps.md
- `TEMPLATES/13_MANUAL_E2E_TEMPLATE.md` → manual-e2e-test.md
- `TRELLO_TEMPLATES/` → 01-12 cards

---

## ✅ Quality Checklist for SDD Files

**Structure:**
- [ ] All files in `docs/sdd/<feature-name>/`
- [ ] Follow pattern: `docs/sdd/web-search-via-gemini-cli/`
- [ ] Consistent naming (kebab-case for directories)
- [ ] trello-cards/ subdirectory present

**Completeness:**
- [ ] README.md (overview)
- [ ] requirements.md (functional requirements)
- [ ] ui-flow.md (user journeys)
- [ ] gaps.md (gap analysis)
- [ ] manual-e2e-test.md (test cases)
- [ ] trello-cards/BOARD.md
- [ ] trello-cards/KICKOFF.md
- [ ] Cards 01-12 (executable)

**Content:**
- [ ] No broken links
- [ ] Consistent terminology
- [ ] Code examples compile
- [ ] Mermaid diagrams renderable
- [ ] File paths correct

**Location Check:**
```bash
# Verify NO files in wrong location
git status .flows/sdd_flow_by_codex/
# Should only show unchanged templates

# Verify files in correct location
ls -la docs/sdd/*/README.md
echo "✅ All SDDs properly organized"
```

---

## 🚫 Common Mistakes to Avoid

### ❌ Mistake 1: Creating files in .flows/
```bash
# WRONG
.flows/sdd_flow_by_codex/my-feature-sdd/

# RIGHT
docs/sdd/my-feature/
```

### ❌ Mistake 2: Scattering files
```bash
# WRONG
root/
  ├── requirements.md
  ├── ui-flow.md
  └── some-other.md

# RIGHT
root/
  └── docs/
      └── sdd/
          └── my-feature/
              ├── requirements.md
              ├── ui-flow.md
              └── trello-cards/
```

### ❌ Mistake 3: Not using templates
```bash
# WRONG (starting from scratch)
echo "# Requirements" > requirements.md
# (missing FR-001, FR-002 structure)

# RIGHT (use template)
cp TEMPLATES/09_REQUIREMENTS_TEMPLATE.md requirements.md
# (then edit with your content)
```

### ❌ Mistake 4: Missing trello-cards/
```bash
# WRONG
docs/sdd/my-feature/
├── README.md
└── requirements.md
# (no trello-cards = not executable)

# RIGHT
docs/sdd/my-feature/
├── README.md
└── trello-cards/
    ├── BOARD.md
    ├── KICKOFF.md
    └── 01-12*.md
```

---

## 📖 SDD File Purpose Reference

| File | Purpose | Template |
|------|---------|----------|
| **README.md** | Project overview | 08_README_TEMPLATE.md |
| **requirements.md** | Functional requirements | 09_REQUIREMENTS_TEMPLATE.md |
| **ui-flow.md** | User journeys | 10_UI_FLOW_TEMPLATE.md |
| **keyword-detection.md** | Detection patterns | 11_DOMAIN_SPEC_TEMPLATE.md |
| **gaps.md** | Gap analysis | 12_GAPS_TEMPLATE.md |
| **manual-e2e-test.md** | Test cases | 13_MANUAL_E2E_TEMPLATE.md |
| **BOARD.md** | Board overview | 15_BOARD_TEMPLATE.md |
| **KICKOFF.md** | Agent guide | 06_KICKOFF_TEMPLATE.md |

---

## 🚀 Quick Start: New SDD Generation

### Template Commands

```bash
cd /home/almaz/zoo_flow/clawdis

# 1. Create directory structure
FEATURE_NAME="my-new-feature"
mkdir -p "docs/sdd/${FEATURE_NAME}/trello-cards"

cd "docs/sdd/${FEATURE_NAME}"

# 2. Copy templates
cp ../../../.flows/sdd_flow_by_codex/TEMPLATES/09_REQUIREMENTS_TEMPLATE.md requirements.md
cp ../../../.flows/sdd_flow_by_codex/TEMPLATES/10_UI_FLOW_TEMPLATE.md ui-flow.md
cp ../../../.flows/sdd_flow_by_codex/TEMPLATES/12_GAPS_TEMPLATE.md gaps.md
cp ../../../.flows/sdd_flow_by_codex/TEMPLATES/13_MANUAL_E2E_TEMPLATE.md manual-e2e-test.md
cp ../../../.flows/sdd_flow_by_codex/TEMPLATES/08_README_TEMPLATE.md README.md

# 3. Create trello cards structure
cd trello-cards
cp ../../../../.flows/sdd_flow_by_codex/TEMPLATES/06_KICKOFF_TEMPLATE.md KICKOFF.md
cp ../../../../.flows/sdd_flow_by_codex/TRELLO_TEMPLATES/15_BOARD_TEMPLATE.md BOARD.md

# 4. Create 12 cards (use generator or cp from examples)
# See: .flows/sdd_flow_by_codex/examples/ for reference

# 5. Verify structure
cd /home/almaz/zoo_flow/clawdis
find "docs/sdd/${FEATURE_NAME}" -name "*.md" | wc -l
# Should be 7 (main docs) + 14 (cards) = 21 files
```

---

## 🔍 Verification Commands

**Check if following conventions:**

```bash
cd /home/almaz/zoo_flow/clawdis

# 1. Verify no files in wrong location
echo "Checking .flows/sdd_flow_by_codex/..."
if git status .flows/sdd_flow_by_codex/ --porcelain | grep -E '\.(md|txt)$'; then
    echo "❌ ERROR: Files detected in .flows/sdd_flow_by_codex/"
    echo "   Move them to docs/sdd/<feature-name>/"
else
    echo "✅ Clean: No files in .flows/sdd_flow_by_codex/"
fi

# 2. Count SDD directories
echo ""
echo "SDD directories found:"
find docs/sdd -maxdepth 1 -type d | grep -v '^docs/sdd$' | wc -l

# 3. Check each has README.md
echo ""
echo "Checking for README.md in each SDD:"
find docs/sdd -mindepth 1 -maxdepth 1 -type d -exec test -f {}/README.md \; -print | wc -l
```

---

## 📝 File Naming Convention

**Directories:** Use kebab-case
```bash
# ✅ GOOD
docs/sdd/web-search-via-gemini-cli/
docs/sdd/auto-archive-conversations/
docs/sdd/brave-search-integration/

# ❌ BAD
docs/sdd/WebSearch/
docs/sdd/web_search/
docs/sdd/websearch/
```

**Files:** Follow existing patterns
```bash
# ✅ GOOD
requirements.md
ui-flow.md
gaps.md
keyword-detection.md

# ❌ BAD
Requirements.md
UI_Flow.md
gaps_analysis.md
```

**Feature Names:** Be descriptive but concise
```bash
# ✅ GOOD
web-search-via-gemini-cli
auto-archive-old-conversations
brave-search-skill-integration

# ❌ BAD
search
feature
new-stuff
```

---

## 📚 Reference Documentation

**SDD Flow Documentation:**
- Main: `.flows/sdd_flow_by_codex/README.md`
- Quick Start: `.flows/sdd_flow_by_codex/AI_AGENT_QUICK_START.md`
- System Summary: `.flows/sdd_flow_by_codex/PROMPT_SYSTEM_SUMMARY.md`

**Templates:**
- Main Templates: `.flows/sdd_flow_by_codex/TEMPLATES/`
- Card Templates: `.flows/sdd_flow_by_codex/TRELLO_TEMPLATES/`
- Examples: `.flows/sdd_flow_by_codex/examples/`

**Examples to Study:**
- Deep Research: `/docs/sdd/deep-research/` (GOLD STANDARD)
- Web Search: `/docs/sdd/web-search-via-gemini-cli/` (just completed)

---

## 🎯 Summary Workflow Diagram

```
┌─────────────────────────────────────────────────────────┐
│  User Provides Requirements                             │
│  (vague, incomplete)                                    │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 1: Create Directory                               │
│  cd docs/sdd/                                           │
│  mkdir <feature-name>                                   │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 2: Copy Templates                                 │
│  cp .flows/sdd_flow_by_codex/TEMPLATES/*.md ./          │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 3: Fill in Content                                │
│  • requirements.md (12 FRs)                            │
│  • ui-flow.md (use cases)                              │
│  • gaps.md (15 gaps)                                   │
│  • keyword-detection.md (patterns)                     │
│  • manual-e2e-test.md (test cases)                     │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 4: Create Trello Cards                            │
│  mkdir trello-cards                                     │
│  Create: BOARD.md, KICKOFF.md, 01.md → 12.md          │
└──────────────────┬──────────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────────┐
│  Step 5: Review & Cleanup                               │
│  ✓ All files in docs/sdd/<feature>/                     │
│  ✓ No files in .flows/                                  │
│  ✓ 7 core docs + 14 card files                          │
│  ✓ Follow naming conventions                            │
└─────────────────────────────────────────────────────────┘
```

---

## ⚡ Quick Command Reference

```bash
# Check for violations (files in wrong place)
git status .flows/sdd_flow_by_codex/

# List all SDD folders
ls -d docs/sdd/*/

# Verify structure of one SDD
find docs/sdd/web-search-via-gemini-cli -type f -name "*.md" | sort

# Count files (should be ~21)
find docs/sdd/web-search-via-gemini-cli -name "*.md" | wc -l

# Template directory
ls /home/almaz/zoo_flow/clawdis/.flows/sdd_flow_by_codex/TEMPLATES/
```

---

## ✅ Final Checklist

Before considering SDD generation complete:

- [ ] All files in `docs/sdd/<feature-name>/`
- [ ] No files in `.flows/sdd_flow_by_codex/` (except unchanged templates)
- [ ] 7 core SDD documents present
- [ ] `trello-cards/` subdirectory exists
- [ ] 14 card files present (BOARD, KICKOFF, 01-12)
- [ ] All files follow naming conventions
- [ ] README.md references all other docs
- [ ] No broken links or references
- [ ] Ready for implementation

---

**Remember:** The `.flows/sdd_flow_by_codex/` directory is SACRED - it's for templates only. Never create task-specific files there. Always use `docs/sdd/<feature-name>/` for all SDD content.