/**
 * Trigger Coordination System
 * 
 * This composable prevents duplicate trigger execution when multiple trigger systems
 * (MTM-level and individual position triggers) fire simultaneously.
 * 
 * Key Features:
 * - Position-based execution tracking using unique trigger keys
 * - Active executions Set to prevent concurrent processing of same position
 * - Time-based debounce as secondary safeguard
 * - Debug logging for trigger coordination
 */

import { ref, reactive } from 'vue'
import { logger } from '@/modules/utils/logger'

// Global state to coordinate triggers across all components
const globalTriggerProcessing = ref(false)
const lastTriggerTime = ref(0)
const TRIGGER_DEBOUNCE_MS = 1000 // 1 second debounce as secondary safeguard

// Position-based execution tracking - PRIMARY mechanism for preventing duplicates
// Key: unique trigger key (brokerName|clientId|symbol|optionType)
// Value: timestamp when execution started
const activeExecutions = reactive<Map<string, number>>(new Map())
const EXECUTION_TIMEOUT_MS = 30000 // 30 seconds - auto-cleanup stale executions

export function useTriggerCoordination() {
  /**
   * Clean up stale executions that may have been left behind
   * (e.g., if an error occurred and cleanup didn't happen)
   */
  const cleanupStaleExecutions = (): void => {
    const now = Date.now()
    for (const [key, startTime] of activeExecutions.entries()) {
      if (now - startTime > EXECUTION_TIMEOUT_MS) {
        logger.debug(`🧹 [Cleanup] Removing stale execution: ${key}`)
        activeExecutions.delete(key)
      }
    }
  }

  /**
   * Check if a specific position trigger can be processed
   * Uses unique trigger key to prevent duplicate executions for same position
   */
  const canProcessPositionTrigger = (triggerKey: string): boolean => {
    cleanupStaleExecutions()

    // Check if this specific position is already being processed
    if (activeExecutions.has(triggerKey)) {
      logger.debug(`🚫 [Position] Trigger blocked - already processing: ${triggerKey}`)
      return false
    }

    return true
  }

  /**
   * Check if a trigger can be processed (legacy global check)
   * Returns true if no other trigger is currently processing
   */
  const canProcessTrigger = (triggerSource: string): boolean => {
    const now = Date.now()

    // Check if already processing globally
    if (globalTriggerProcessing.value) {
      logger.debug(`🚫 [${triggerSource}] Trigger blocked - global processing active`)
      return false
    }

    // Check debounce period as secondary safeguard
    if (now - lastTriggerTime.value < TRIGGER_DEBOUNCE_MS) {
      logger.debug(`🚫 [${triggerSource}] Trigger blocked - within debounce period`)
      return false
    }

    return true
  }

  /**
   * Start processing for a specific position
   * Adds the trigger key to active executions
   */
  const startPositionProcessing = (triggerKey: string): boolean => {
    if (!canProcessPositionTrigger(triggerKey)) {
      return false
    }

    logger.debug(`🔄 [Position] Starting execution: ${triggerKey}`)
    activeExecutions.set(triggerKey, Date.now())
    return true
  }

  /**
   * End processing for a specific position
   * Removes the trigger key from active executions
   */
  const endPositionProcessing = (triggerKey: string): void => {
    logger.debug(`✅ [Position] Ending execution: ${triggerKey}`)
    activeExecutions.delete(triggerKey)
  }

  /**
   * Start trigger processing (legacy global)
   * Sets the global flag to prevent other triggers from executing
   */
  const startTriggerProcessing = (triggerSource: string): boolean => {
    if (!canProcessTrigger(triggerSource)) {
      return false
    }

    logger.debug(`🔄 [${triggerSource}] Starting trigger processing`)
    globalTriggerProcessing.value = true
    lastTriggerTime.value = Date.now()
    return true
  }

  /**
   * End trigger processing (legacy global)
   * Clears the global flag and allows other triggers to execute
   */
  const endTriggerProcessing = (triggerSource: string): void => {
    logger.debug(`✅ [${triggerSource}] Ending trigger processing`)
    globalTriggerProcessing.value = false
  }

  /**
   * Execute a trigger with position-based coordination
   * Uses unique trigger key to prevent duplicate executions for same position
   * This is the PREFERRED method for position triggers
   */
  const executePositionTrigger = async (
    triggerKey: string,
    triggerFunction: () => Promise<void>
  ): Promise<boolean> => {
    if (!startPositionProcessing(triggerKey)) {
      return false
    }

    try {
      await triggerFunction()
      return true
    } catch (error) {
      logger.error(`❌ [Position] Execution failed for ${triggerKey}:`, error)
      throw error
    } finally {
      // Small delay before cleanup to prevent rapid re-triggering
      setTimeout(() => {
        endPositionProcessing(triggerKey)
      }, 500)
    }
  }

  /**
   * Execute a trigger with coordination (legacy global method)
   * Automatically handles the processing flag lifecycle
   */
  const executeWithCoordination = async (
    triggerSource: string,
    triggerFunction: () => Promise<void>
  ): Promise<boolean> => {
    if (!startTriggerProcessing(triggerSource)) {
      return false
    }

    try {
      await triggerFunction()
      return true
    } catch (error) {
      logger.error(`❌ [${triggerSource}] Trigger execution failed:`, error)
      throw error
    } finally {
      // Add a delay before clearing the flag to ensure proper coordination
      setTimeout(() => {
        endTriggerProcessing(triggerSource)
      }, 500)
    }
  }

  /**
   * Check if a specific position is currently being processed
   */
  const isPositionProcessing = (triggerKey: string): boolean => {
    return activeExecutions.has(triggerKey)
  }

  /**
   * Get current processing status (for debugging)
   */
  const getTriggerStatus = () => ({
    isProcessing: globalTriggerProcessing.value,
    lastTriggerTime: lastTriggerTime.value,
    timeSinceLastTrigger: Date.now() - lastTriggerTime.value,
    activeExecutions: Array.from(activeExecutions.keys()),
    activeExecutionCount: activeExecutions.size
  })

  return {
    // Position-based coordination (PREFERRED)
    canProcessPositionTrigger,
    startPositionProcessing,
    endPositionProcessing,
    executePositionTrigger,
    isPositionProcessing,
    // Legacy global coordination
    canProcessTrigger,
    startTriggerProcessing,
    endTriggerProcessing,
    executeWithCoordination,
    // Status
    getTriggerStatus,
    isProcessing: globalTriggerProcessing
  }
}
