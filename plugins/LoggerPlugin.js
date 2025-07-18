class LoggerPlugin {
  apply(compiler) {
    compiler.hooks.beforeRun.tapAsync("LoggerPlugin", async (compiler) => {
      console.log("🚀 开始编译...");
    });

    compiler.hooks.done.tap("LoggerPlugin", (stats) => {
      console.log(
        `✅ 编译完成，共 ${stats.modules} 个模块，耗时 ${stats.time}ms`
      );
    });
  }
}

module.exports = LoggerPlugin;
