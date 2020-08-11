# Welcome

Congratulations on successfully creating a harp.gl project!

# Getting started

If you want some help getting started, check out: https://developer.here.com/tutorials/harpgl/

Otherwise, see our broad range of examples: https://www.harp.gl/docs/master/examples/

# Note

The `resources` directory can be used to add themes / data etc, so for example, if you have a dark theme, you could add it to the `resources` directory and reference it as so:

```typescript
const app = new View({
  ...
  theme: "resources/dark.json",
});
```

Because this project uses webpack, if you want to rename this, you need to adjust the `webpack.config.js` file accordingly, so it knows where to find this directory.
