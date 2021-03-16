# General

A guide to our coding style and conventions.

We try to have reasonable rules and follow them to the best of our capabilities, so that we can:

1. Have clear code
1. Ease the maintenance and reusability
1. Limit the discussions about how to write and what to write in commits, comments and code, making code reviews focus on the essentials
1. An overall better developer experience

If you have suggestions, please see our [contribution guidelines](CONTRIBUTING.md) and feel free to make a pull request.

---

## Good practices

1. Use the advantages of Typescript's typings as much as possible, all code should be typed and `any` types should be avoided if not specifically meant to be of type `any`.
1. Javascript/Typescript is very flexible in many ways, use them wisely, but try to think in a more C++ way and in concepts of `const methods` and `variables`, `private` and `public` etc., be careful when passing around objects as they are references.
1. Use simplest tool for the job: `function` vs. `object/namespace/module` vs `class`.
1. Follow [SOLID design principles](https://dev.to/samueleresca/solid-principles-using-typescript).
    - Create classes and functions with **S**ingle responsibility.
    - Create classes and functions **O**pen for extension by identifying customization points and Closed for modification by making small parts well-defined and composable.
    - Create classes that lend to **L**iskov-substitution. Use abstract interfaces for dynamic customization point. Preserve interface semantics and invariants, don't strengthen pre-conditions and don't weaken post-conditions.
    - Create narrow, segregated **I**nterfaces so that the caller doesn't depend on concepts outside of its domain.
    - Create customization points by accepting **D**ependencies through abstract interfaces. Give dependencies to objects explicitly instead of pulling them implicitly from the inside.
1. Include responsibility and collaborators within the documentation.
Responsibility description should be as simple as a single sentence without conjunctions. If it's not expressible like that, it's a hint that such a class has multiple responsibilities. Documentation should also include potential users and dependencies of the class and it's relationship to them. Check the `Documentation` section below for more details.
1. Avoid implementation inheritance. Use composition instead.
Inherit not to reuse but to be reused. Implementation inheritance is usually used to reduce effort, not because it's solving a problem. It's actually creating a problem of implicit dependencies and fragile base classes. Specific implementations of an interface should be created from helpers through composition and marked as final to prevent further derivation.
1. Keep interfaces pure by avoiding data members
If an interface has data member, it's no longer abstract. Derived classes can't get rid of them and need to pay the cost in object size. Keep interfaces narrow and pure.
1. Keep performance and memory consumption in mind.
    - Try not to create many temporary object as the garbage collector will kick in and might freeze the process.
    - Prefer for example object of arrays over array of objects.
    - Prefer *result* and *scratch variables*, for example:

        ```javascript
        function add( Vector a, Vector b, Vector result) {
            result.x = a.x + b.x;
            result.y = a.y + b.y;
            result.z = a.z + b.z;
        }
        ```

1. Workers run in their own context and every object passed to a worker is a copy and looses all prototype and function information. So all these must be reconstructed on the worker and is very time consuming. Keep in mind that **only** ArrayBuffer and MessagePort are transferable objects as defined in the specification. Therefore to communicate with Workers prefer to only use ArrayBufferLike.
1. Although we are using an object oriented approach still use it in a Typescript/Javascript way:
    - i.e. In Type/Javascript not everything needs to be a class,  if defining a singleton use a namespace or module instead of a class, so it cannot be instantiated and you can provide your create method
1. Avoid adding additional libraries, we want to keep the `sdk` as slim as possible.
1. Avoid [truthy/falsy Statements](https://www.sitepoint.com/javascript-truthy-falsy/).
    - For primitive types, use strict comparisons _(===, !==)_ to convert to boolean explicitly.
    ```typescript
    if (stringVariable !== undefined)
    ```
    - For object types, implicit boolean conversion is preferred over checking explicitely for `undefined` or `null`.
    ```typescript
    if (myObject)
    if (!myArray)
    if (myFunction)
    ```

1. *Do not use !! in the code*. The !!_trick_ is just a way to make a truthy operation a boolean one, but the issue with truthiness is *not solved*, but *hidden*. Consider the following example:

    ```typescript
    let str = undefined
    !!str // is false even when undefined

    let str = ""
    !!str // is false even when the string has 0 length

    if (str === undefined || str.length ===0)
    ```
    Here is a way not to use !! (based on [this](https://stackoverflow.com/questions/784929/what-is-the-not-not-operator-in-javascript/1406618#1406618)):
    ```typescript
    // !! is a horribly obscure way to do a type conversion.
    // ! is NOT.
    // !true is false,
    // !false is true
    // !0 is true, and !1 is false.

    // So you're converting a value to a boolean, then inverting it, then inverting it again.

    // Maximum Obscurity:
    let val.enabled = !!userId;
    let this.pauseButton:HTMLElement = new HTMLElement();

    // much easier to understand:
    let val.enabled = (userId != 0);

    if (this.pauseButton !== undefined) {
    // ...
    }
    ```

1. Usage of "Non-null assertion operator" in the code. Don't use it when declaring members which are not initialized (if needed use optional operator instead: ?)

    ```typescript
    // Don't use ! to overcome typescript's strict initialization rule

    export class FeatureGroup {
        /* Optional indices */
        layerIndex!: number[];


    // Use optional operator instead
    export class FeatureGroup {
        /* Optional indices */
        layerIndex?: number[];
    ```

1. If form the code logic you are sure the variable will not be null at a given point of execution use the ! locally (as close to the invocation as possible)

    ```typescript
    // If there is a justified need to use ! operator, keep it as close to the invocation as possible
    if (this.storeExtendedTags) {
        featureGroup.layerIndex![featureGroup.numFeatures] = this.addLayer(env.lookup("$layer")); //mind the ! near layerIndex.
    }
    ```

1. Prefer `for` loops over `forEach` functions. Iterables are nice for the readability of `#reduce`, `#map`, `#filter`, `#find` and the like, but impact performance by creating a new function.
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

1. For Options or Enums related to a class, begin the name with the PascalCase class name:, for example: `MapViewOptions`, `enum DecodedTileMessageType`
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
   - Create the properties in the constructor wherever possible
   - Create private `setupXYZ` methods, if applicable.
   - Instead of `setupXYZ` methods, it might be possible to create a subclass of the object and initialize the members there.
   - Consider applying [Carmack's "good judgement"](http://number-none.com/blow/john_carmack_on_inlined_code.html) by breaking this rule ONLY if it is necessary.
1. Use `undefined`, don't use `null`. Inspired from: https://github.com/Microsoft/TypeScript/wiki/Coding-guidelines#null-and-undefined

## Formatting

- Formatting rules are defined in the `tslint.json` file contained in the development environment.
- Indentation rules are defined in the `.prettierrc.json` file contained in the development environment.
- A good formatting plugin is Visual Studio Code's "prettier" extension.

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

1. Write your comments in a [TSDoc] compliant way.

1. Document the single responsibility of a class or function.

   If you notice the description becoming too complex, it could be a sign that the construct is doing too many things and should be split up.

1. Avoid documenting the obvious.

   For example on a method `enableProfiling()`, don't add a brief section that this method enables profiling.

1. If you have to leave "TODO" comments in the code, make sure that they include a related ticket number, so that the work is tracked and not forgotten.

## Recommended [TSDoc] Style

1. Write proper English sentences.
1. Put a period "." at the end of a line or sentence.
1. Write abbreviations in uppercase: HTML, HTTP, WHATWG.
1. Add proper external references: `... [WHATWG fetch](https://fetch.spec.whatwg.org/) ...`
1. Refer to other classes/interfaces with proper tsdoc links. To refer to class named "Headers", write the link: `{@link Headers}`.
1. Refer to the current class with backquote/backticks: `` `CancellationToken` ``.
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
 * {@link CancellationException}.
 *
 * **Note:** Cancellation is not guaranteed to work. Some functions do not support cancellation.
 * Others, due to the asynchronous nature, might have already finished by the time the cancellation
 * is received, in which case the result is returned rather than a [[CancellationException]].
 *
 * See also {@link fetch}.
 */
...
    /**
     * Constructs a new immutable instance of a {@link TileKey}.
     *
     * For better readability, {@link TileKey.fromRowColumnLevel} should be preferred.
     *
     * Note - row and column must not be greater than the maximum rows/columns for the given level.
     *
     * @param row - Represents the row in the quadtree.
     * @param column - Represents the column in the quadtree.
     * @param level - Represents the level in the quadtree.
     */
    constructor(public readonly row: number, public readonly column: number, public readonly level: number) {
    }


    /**
     * Equality operator.
     *
     * @param qnr - The tile key to compare to.
     * @returns `true` if this tile key has identical row, column and level, `false` otherwise.
     */
```

## Deprecation

If an API should not be used anymore it needs to be marked as deprecated. Therefore the `@deprecated` [tag](https://api-extractor.com/pages/tsdoc/tag_deprecated/) should be added to the documentation of the entity.

The deprecation description needs to contain an alternative to the old API (if it exists) and a release version when the API will be removed.

[harp.gl](https://harp.gl) has a deprecation period of at least one minor release cycle.
If for example harp `0.x.0` is the latest release and you add the deprecation to master, you can only remove the API for `harp 0.x+2.0`, i.e. after `harp 0.x+1.0` was released.

Public API must not be removed if it was not marked as deprecated for at least one release cyle.

## Testing

Every topic/submit should come with tests or a short review in the corresponding ticket of why it cannot be tested and/or what is missing for it to be tested.

Use tests wherever it is possible.

## Code reviews

When reviewing code please check that the code is in sync with the guidelines. If it would be helpful and/or feasible you could go over the code together with the owner together. When reviewing code, as long as there is comments for changes however trivial, give at least a non-approved state, so the author is aware of the review and the need to address your comments.

## Code formatting

There are two tools used: prettier and tslint.

- [tslint](https://github.com/Microsoft/vscode-tslint.git). We use a `tslint.json` file inside `mapsdk` to keep the formatting rules we apply.

- [prettier](https://github.com/prettier/prettier-vscode).
It can be used as an extension for Visual Studio Code to help format the code.

### How should I format my code before submitting for review

Before committing your code make sure you run `tslint` and `prettier` (either via command line or within your IDE (for example in Visual Studio Code you could use the: `Ctrl+Shift+P >Format...`)

In case you need to change styling in already merged code - make sure to prepare a separate commit with applied formatting and merge it before merging your changes. (Please apply formatting to the whole directory/module).

[TSDoc]: https://github.com/Microsoft/tsdoc
