# Code Style

This file specifies the style of the code that we should follow.

## General

- Use 4 spaces for indentation.
- No trailing spaces.
- No newline before opening brace.
- A line should not exceed 80 characters.

## Naming

- Use camelCase for:
    - Variable names
    - TypeScript file names
- Use PascalCase for:
    - Class names
    - Vue components and file names
- Use SNAKE_CASE for:
    - Constant names

## Function Declaration

- Use `function` keyword for function declaration.

```typescript
/**
 * Docstring here.
 * 
 * @param argsCanBeInOneLine Description of arg1.
 * @returns Description of return value.
 */
function shortFunc(argsCanBeInOneLine: string): number {
    // ...
}

function someFunc(
    too: string,
    many: number,
    arguments: boolean,
    forOneLine: HTMLDivElement,
): string {
    // ...
}
```
