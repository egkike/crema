/**
 * UserNotesService
 * Part of SDD: docs/project/architecture-improvements/sdd/user-context/
 * 
 * Security: All methods require userId for ownership validation
 */

import { userNotesRepository, type UserNote, type NoteType } from '../repositories/user-notes.repository';
import { AppError } from '../errors/AppError';
import logger from '../utils/logger';

// Helper for runtime validation
const VALID_NOTE_TYPES: readonly NoteType[] = ['highlight', 'bookmark', 'note'];
function isValidNoteType(value: string): value is NoteType {
  return VALID_NOTE_TYPES.includes(value as NoteType);
}

export const userNotesService = {
  /**
   * Create a note
   */
  async createNote(
    userId: string,
    productId: string,
    noteText: string,
    noteType: string,
    position?: number
  ): Promise<UserNote> {
    // RUNTIME validation for noteType
    if (!isValidNoteType(noteType)) {
      throw new AppError(`Invalid noteType: ${noteType}. Must be: highlight, bookmark, or note`, 400);
    }
    
    // Length validation (XSS protection)
    if (!noteText || noteText.length === 0 || noteText.length > 5000) {
      throw new AppError('noteText must be between 1 and 5000 characters', 400);
    }
    
    try {
      return userNotesRepository.create({ userId, productId, noteText, noteType, position });
    } catch (error) {
      logger.error({ error, userId, productId, noteType }, 'UserNotesService: createNote failed');
      throw error;
    }
  },

  /**
   * Get notes for user + product
   */
  async getNotes(userId: string, productId: string): Promise<UserNote[]> {
    try {
      return userNotesRepository.findByUserAndProduct(userId, productId);
    } catch (error) {
      logger.error({ error, userId, productId }, 'UserNotesService: getNotes failed');
      throw error;
    }
  },

  /**
   * Get all notes for a user
   */
  async getAllNotes(userId: string): Promise<UserNote[]> {
    try {
      return userNotesRepository.findByUser(userId);
    } catch (error) {
      logger.error({ error, userId }, 'UserNotesService: getAllNotes failed');
      throw error;
    }
  },

  /**
   * Update a note (SECURITY: requires userId for ownership)
   */
  async updateNote(id: string, userId: string, noteText: string): Promise<UserNote> {
    // Length validation (XSS protection)
    if (!noteText || noteText.length === 0 || noteText.length > 5000) {
      throw new AppError('noteText must be between 1 and 5000 characters', 400);
    }
    
    try {
      // Repository now validates ownership via userId parameter
      return userNotesRepository.update(id, userId, noteText);
    } catch (error) {
      logger.error({ error, id, userId }, 'UserNotesService: updateNote failed');
      throw error;
    }
  },

  /**
   * Delete a note (SECURITY: requires userId for ownership)
   */
  async deleteNote(id: string, userId: string): Promise<boolean> {
    try {
      // Repository now validates ownership via userId parameter
      return userNotesRepository.delete(id, userId);
    } catch (error) {
      logger.error({ error, id, userId }, 'UserNotesService: deleteNote failed');
      throw error;
    }
  },

  /**
   * Get notes by type (now uses SQL filter, not JS filter)
   */
  async getNotesByType(userId: string, productId: string, noteType: string): Promise<UserNote[]> {
    // Runtime validation for noteType
    if (!isValidNoteType(noteType)) {
      throw new AppError(`Invalid noteType: ${noteType}. Must be: highlight, bookmark, or note`, 400);
    }
    
    try {
      // Now uses SQL-level filtering
      return userNotesRepository.findByUserAndProductAndType(userId, productId, noteType as NoteType);
    } catch (error) {
      logger.error({ error, userId, productId, noteType }, 'UserNotesService: getNotesByType failed');
      throw error;
    }
  },
};