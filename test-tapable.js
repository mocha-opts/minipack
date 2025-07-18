const {
  SyncHook,
  AsyncSeriesHook,
  AsyncParallelHook,
} = require("./my-tapable");

// 1. 测试 SyncHook
const syncHook = new SyncHook(["arg1", "arg2"]);
syncHook.tap("plugin1", (arg1, arg2) => {
  console.log("plugin1", arg1, arg2);
});
syncHook.tap("plugin2", (arg1, arg2) => {
  console.log("plugin2", arg1.toUpperCase(), arg2.toUpperCase());
});

console.log("=== SyncHook 测试 ===");
syncHook.call("hello", "world");

// 2. 测试 AsyncSeriesHook
const asyncSeriesHook = new AsyncSeriesHook(["data"]);
asyncSeriesHook.tapAsync("asyncPlugin1", (data, callback) => {
  setTimeout(() => {
    console.log("asyncPlugin1", data);
    callback();
  }, 500);
});
asyncSeriesHook.tapPromise("asyncPlugin2", (data) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("asyncPlugin2", data + "!");
      resolve();
    }, 300);
  });
});

console.log("\n=== AsyncSeriesHook 测试 ===");
asyncSeriesHook.callAsync("series data", () => {
  console.log("all async series done");
});

// 3. 测试 AsyncParallelHook
const asyncParallelHook = new AsyncParallelHook(["items"]);
asyncParallelHook.tapAsync("parallelPlugin1", (items, callback) => {
  setTimeout(() => {
    console.log("parallelPlugin1", items[0]);
    callback();
  }, 1000);
});
asyncParallelHook.tapPromise("parallelPlugin2", (items) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log("parallelPlugin2", items[1]);
      resolve();
    }, 500);
  });
});

console.log("\n=== AsyncParallelHook 测试 ===");
asyncParallelHook.promise(["apple", "banana"]).then(() => {
  console.log("all async parallel done");
});

// 4. 测试拦截器
const interceptedHook = new SyncHook(["value"]);
interceptedHook.intercept({
  call: (value) => console.log(`拦截器: 调用 hook 值=${value}`),
  tap: (tapInfo) => console.log(`拦截器: 插件 ${tapInfo.name} 被调用`),
});

interceptedHook.tap("pluginA", (value) => {
  console.log("pluginA", value * 2);
});
interceptedHook.tap("pluginB", (value) => {
  console.log("pluginB", value * 3);
});

console.log("\n=== 拦截器测试 ===");
interceptedHook.call(10);
