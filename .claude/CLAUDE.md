# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Fork-Specific Agent Instructions

Read @.workflow/AGENTS.md for complete workflow documentation.

## Tool Usage

Prefer built-in Claude Code tools over Bash equivalents:

| Instead of            | Use           |
| --------------------- | ------------- |
| `cat`, `head`, `tail` | **Read** tool |
| `grep`, `rg`          | **Grep** tool |
| `find`                | **Glob** tool |
| `sed`, `awk`          | **Edit** tool |

Built-in tools provide better error handling, security, and integrate with Claude's context.

## Common Mistakes

TBD
