import { SchemaId, ValidationResult, Validator } from '../types';
import { schemaRegistry } from './schemaRegistry';
import { toolRegistry } from '../toolRegistry';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Schema validator implementation using AJV
 * Provides validation against registered schemas
 */
export class LinkerValidator implements Validator {
  private ajv: Ajv;

  constructor() {
    // Initialize AJV with formats support
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strictSchema: false
    });
    
    // Add formats like date, email, etc.
    addFormats(this.ajv);
  }

  /**
   * Validate data against a registered schema
   */
  async validateAgainstSchema(data: any, schemaId: SchemaId): Promise<ValidationResult> {
    // Fetch schema definition
    const schema = await schemaRegistry.getSchema(schemaId);
    
    if (!schema) {
      return {
        valid: false,
        errors: [`Schema with ID ${schemaId} not found`]
      };
    }
    
    try {
      // Compile and validate
      const validate = this.ajv.compile(schema.jsonSchema);
      const valid = validate(data);
      
      if (valid) {
        return { valid: true };
      } else {
        return {
          valid: false,
          errors: this.formatValidationErrors(validate.errors || [])
        };
      }
    } catch (error) {
      console.error('Validation error:', error);
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : String(error)}`]
      };
    }
  }

  /**
   * Validate input data for a specific tool
   */
  async validateToolInput(toolId: string, input: any): Promise<ValidationResult> {
    const tool = await toolRegistry.getTool(toolId);
    
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool with ID ${toolId} not found`]
      };
    }
    
    if (!tool.inputSchema) {
      // No schema defined, assume valid
      return { valid: true };
    }
    
    return this.validateAgainstSchema(input, tool.inputSchema);
  }

  /**
   * Validate output data for a specific tool
   */
  async validateToolOutput(toolId: string, output: any): Promise<ValidationResult> {
    const tool = await toolRegistry.getTool(toolId);
    
    if (!tool) {
      return {
        valid: false,
        errors: [`Tool with ID ${toolId} not found`]
      };
    }
    
    if (!tool.outputSchema) {
      // No schema defined, assume valid
      return { valid: true };
    }
    
    return this.validateAgainstSchema(output, tool.outputSchema);
  }

  /**
   * Format AJV validation errors to readable strings
   */
  private formatValidationErrors(errors: any[]): string[] {
    return errors.map(error => {
      const path = error.instancePath ? error.instancePath : '';
      const message = error.message || 'unknown error';
      
      return `${path} ${message}`;
    });
  }
}

/**
 * Create and export a singleton instance of the validator
 */
export const linkerValidator = new LinkerValidator();
