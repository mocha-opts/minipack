const { default: traverse } = require("@babel/traverse");
const t = require("@babel/types"); // 添加这行导入

class ASTAnalyzerPlugin {
  apply(compiler) {
    compiler.hooks.beforeParse.tapPromise(
      "ASTAnalyzerPlugin",
      async (filename) => {
        console.log(`🔍 即将解析文件: ${filename}`);
      }
    );

    compiler.hooks.afterParse.tap("ASTAnalyzerPlugin", (filename, ast) => {
      let importCount = 0;
      let requireCount = 0;

      traverse(ast, {
        ImportDeclaration: () => {
          importCount++;
        },
        CallExpression: ({ node }) => {
          if (t.isIdentifier(node.callee, { name: "require" })) {
            requireCount++;
          }
        },
      });

      console.log(
        `📊 ${filename} 中有 ${importCount} 个import和${requireCount}个require`
      );
    });
  }
}

module.exports = ASTAnalyzerPlugin;
