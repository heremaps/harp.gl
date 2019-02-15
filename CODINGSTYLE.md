# General

A guide to our coding style and conventions.

We try to have reasonable rules and follow them to the best of our capabilities, so that we can:

1. Have better and clear code
1. Ease the maintenance and reusability
1. Limit the discussions about how to write and what to write in commits, comments and code
1. An overall better developer experience

If you have suggestions, please see our [contribution guidelines](CONTRIBUTING.md) and feel free to make a pull request.

---

1. Use PascalCase for file names.
1. Use PascalCase for class and namespace names, for example: `ClassName`, `NamespaceName`
1. Use camelCase for method names, for example: `ClassName.methodName`
1. Use camelCase for public class members, for example: `classMember`
1. Use camelCase prefixed by `m_` for private properties
1. Don't use `public` in TypeScript, as it's implicit and should be not used for methods and properties
1. Use PascalCase for enum names, for example: `ExampleEnum`
1. Use PascalCase for file names of modules, for example: `MapView.ts`
1. Use UpperCase for global constants, for example
   ```typescript
   static readonly GRID_SIZE = 3;
   const RAD2DEG = 180.0 / Math.PI;
   // !! local const variable should be named like other member variables in camelCase
   ```
1. User lower-case package names with a dash separator, for example:  `mapview` or `harp-examples`.
1. Add a lib and a test folder to a the package, for example: `mapview/lib` and `mapview/test`
1. Always declare types as interfaces.
1. Make sure to differentiate between the two types of interfaces: those used as a type or those that are implemented as classes.
1. Use PascalCase for Type interfaces, such as `interface Style {}`
1. Use "I"+PascalCase for Class interfaces, such as `interface ILogger {}`
1. Use PascalCase for enum name and types, for example:
   ```typescript
   export enum BillboardType {
       None = 0,
       Spherical = 1,
       Cylindrical = 2
   };
   ```
1. For Options or Enums releated to a class, begin the name with the PascalCase class name:, for example: `MapViewOptions`, `enum DecodedTileMessageType`
1. Define class properties at the top of the class or in the constructor, which should be the first call after the properties, for example:
   ```typescript
   class Foo {
       private readonly a: boolean = true;
       private readonly b: boolean = true;

       constructor(private readonly c: boolean) { }
       function bar(): void { }
    }
   ```
1. When you implement new code, make sure to compile the code according to TypeScript's `strictPropertyInitialization` rule, without making class members optional ("`!`"). If it is necessary for member objects to have a complex setup, follow these guidelines:
   * Create the properties in the constructor wherever possible
   * Create private setupXYZ methods, if applicable.
   * Instead of setupXYZ methods, it might be possible to create a subclass of the object and initialize the members there.
   * Consider applying Carmack's "good judgement" by breaking this rule ONLY if it is necessary.
   Reference: http://number-none.com/blow/john_carmack_on_inlined_code.html

# Formatting

* Formatting rules are defined in the `tslint.json` file contained in the development environment.
* Indentation rules are defined in the `.prettierrc.json` file contained in the development environment.
* A good formatting plugin is Visual Studio Code's "prettier" extension.

## Visual Studio Code Configuration

The important settings for VSCode. Apply these settings in the *User Settings* tab, found in *File --> Preferences --> Settings*.

```json
    "editor.renderWhitespace": "all",
    "editor.rulers": [
        100
    ],
    "editor.trimAutoWhitespace": true,
    "editor.wordWrapColumn": 100,
    "editor.formatOnType": true,
    "editor.formatOnSave": false,
    "[typescript]": {
        "editor.formatOnSave": true
    },
    "[javascript]": {
        "editor.formatOnSave": true
    }
    "files.eol": "\n",
    "files.trimTrailingWhitespace": true,

    "prettier.tabWidth": 4,
    "prettier.printWidth": 100,

    "tslint.alwaysShowStatus": true,
    "tslint.alwaysShowRuleFailuresAsWarnings": false,
    "tslint.enable": true,
```

## Commit Message
The purpose of a commit message is to summarize the scope and context of a patch for maintainers and potential reviewers.

1. Be terse.

   Writing a good commit message is an exercise in stripping unnecessary words leaving only the bare essence.

1. Use *present tense imperative* to describe what the patch does to the codebase.

   For example: "Add function to triangulate a monotone polygon.", instead of "Added" or "Adding".

1. Insert a blank line between the commit title and the rest of the message.

1. Optionally, provide a short summary of what changes are part of the patch.

   Ideally the commit message should consist of imperative sentences. For complex changes more elaborate explanation is acceptable.

1. Split unrelated changes into multiple patches.

   Bug fixes should always be committed separately so that they can be cherry-picked.

## Documentation

1. Write your comments in a `typedoc` compliant way.

1. Document the single responsibility of a class or function.

   If you notice the description becoming too complex, it could be a sign that the construct is doing too many things and should be split up.

1. Avoid documenting the obvious.

   For example on a method `enableProfiling()`, don't add a brief section that this method enables profiling.

1. If you have to leave "TODO" comments in the code, make sure that they include a related ticket number, so that the work is tracked and not forgotten.

## Recommended TypeDoc Style

1. Write proper English sentences.
1. Put a period "." at the end of a line or sentence.
1. Write abbreviations in uppercase: HTML, HTTP, WHATWG.
1. Add proper external references: `... [WHATWG fetch](https://fetch.spec.whatwg.org/) ...`
1. Refer to other classes/interfaces with proper markdown links. To refer to class named "Headers", write the link: `[[Headers]]`.
1. Refer to the current class with backticks: `` `CancellationToken` ``.
1. Write constants and other values, as well as function calls with backticks, for example: `` `true` `` instead of just "true", `` `cancel()` `` instead of just "cancel()".
1. Try to write "speakable" sentences, use "for example" instead of "e.g.".

Example:

```typescript
/**
 * Instances of `CancellationToken` can be used to cancel an ongoing request.
 *
 * Example:
 *
 * ```typescript
 * const cancellationToken = new CancellationToken();
 * fetch("http://here.com/", { cancellationToken });
 * // later, if you decide to cancel the request:
 * cancellationToken.cancel();
 * ```
 *
 * **Note:** If you cancel an async function, it will not resolve but throw a
 * [[CancellationException]].
 *
 * **Note:** Cancellation is not guaranteed to work. Some functions do not support cancellation.
 * Others, due to the asynchronous nature, might have already finished by the time the cancellation
 * is received, in which case the result is returned rather than a [[CancellationException]].
 *
 * See also [[fetch]].
 */
...
    /**
     * Constructs a new immutable instance of a `TileKey`.
     *
     * For better readability, [[TileKey.fromRowColumnLevel]] should be preferred.
     *
     * Note - row and column must not be greater than the maximum rows/columns for the given level.
     *
     * @param row Represents the row in the quadtree.
     * @param column Represents the column in the quadtree.
     * @param level Represents the level in the quadtree.
     */
    constructor(public readonly row: number, public readonly column: number, public readonly level: number) {
    }


    /**
     * Equality operator.
     *
     * @param qnr The tile key to compare to.
     * @returns `true` if this tile key has identical row, column and level, `false` otherwise.
     */
```
