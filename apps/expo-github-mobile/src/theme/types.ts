// Helper to get tool color
import { Colors } from './colors'
import { ToolType } from '../models/types'

export const getToolColor = (type: ToolType): string => {
  switch (type) {
    case ToolType.Write:
    case ToolType.Edit:
      return Colors.toolWrite
    case ToolType.Bash:
      return Colors.toolBash
    case ToolType.Read:
    case ToolType.Glob:
    case ToolType.Grep:
      return Colors.toolRead
  }
}
