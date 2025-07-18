class OptimizerPlugin {
  apply(compiler) {
    compiler.hooks.afterCompile.tapPromise(
      "OptimizerPlugin",
      async (modules) => {
        console.log("🔧 正在优化模块...");
        await new Promise((resolve) => setTimeout(resolve, 500));
        console.log(`✨ 优化完成，共 ${modules.size} 个模块`);
      }
    );

    compiler.hooks.emit.tap("OptimizerPlugin", (assets) => {
      console.log("📦 生成资源文件...");
      assets["bundle.js"] = `/* 由MiniPack生成 */\n${assets["bundle.js"]}`;
    });
  }
}

module.exports = OptimizerPlugin;
