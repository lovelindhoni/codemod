import type { API, FileInfo, Options } from "jscodeshift";

export default function transform(
  file: FileInfo,
  api: API,
  options?: Options,
): string | undefined {
  const j = api.jscodeshift;
  const root = j(file.source);

  let isDirty = false;

  function addImportDeclaration(name?: string) {
    let importFromReact = root.find(j.ImportDeclaration, {
      source: { value: "react" },
    });
    if (importFromReact.length === 0) {
      isDirty = true;
      root
        .get()
        .node.program.body.unshift(
          j.importDeclaration(
            [
              name
                ? j.importSpecifier(
                    j.identifier("useActionState"),
                    name ? j.identifier(name) : undefined,
                  )
                : j.importSpecifier(j.identifier("useActionState")),
            ],
            j.literal("react"),
          ),
        );
      importFromReact = root.find(j.ImportDeclaration, {
        source: { value: "react" },
      });
    }
  }

  // Get default import from react-dom
  const defaultImportName = root
    .find(j.ImportDeclaration, {
      source: { value: "react-dom" },
      specifiers: [{ type: "ImportDefaultSpecifier" }],
    })
    .paths()
    .at(0)
    ?.node.specifiers?.at(0)?.local?.name;

  // Get default import from test utils
  const starImportName = root
    .find(j.ImportDeclaration, {
      source: { value: "react-dom" },
      specifiers: [{ type: "ImportNamespaceSpecifier" }],
    })
    .paths()
    .at(0)
    ?.node.specifiers?.at(0)?.local?.name;

  const utilsCalleeName = defaultImportName ?? starImportName;
  const utilsCalleeType: any = defaultImportName
    ? "ImportDefaultSpecifier"
    : "ImportNamespaceSpecifier";

  // For usages like `import * as ReactDOM from 'react-dom'; ReactDOM.useFormState()`
  const actAccessExpressions = root.find(j.MemberExpression, {
    object: { name: utilsCalleeName },
    property: { name: "useFormState" },
  });

  if (actAccessExpressions.length > 0) {
    // React import
    addImportDeclaration();
    root
      .find(j.ImportDeclaration, {
        source: { value: "react-dom" },
        specifiers: [{ type: "ImportDefaultSpecifier" }],
      })
      .remove();
    root
      .find(j.ImportDeclaration, {
        source: { value: "react-dom" },
        specifiers: [{ type: "ImportNamespaceSpecifier" }],
      })
      .remove();

    actAccessExpressions.replaceWith(() => {
      isDirty = true;
      return j.identifier("useActionState");
    });
  }

  // For direct imports, such as `import { useFormState } from 'react-dom';`
  const reactDOMImportCollection = root.find(j.ImportDeclaration, {
    source: { value: "react-dom" },
  });

  const reactDOMImportPath = reactDOMImportCollection.paths().at(0);

  if (!reactDOMImportPath) {
    return isDirty ? root.toSource() : undefined;
  }

  const specifier = reactDOMImportPath.node.specifiers?.find(
    (s) => s.type === "ImportSpecifier" && s.imported.name === "useFormState",
  );

  if (!specifier || !j.ImportSpecifier.check(specifier)) {
    return isDirty ? root.toSource() : undefined;
  }

  const usedName = specifier.local?.name ?? specifier.imported.name;

  // Replace import name
  reactDOMImportCollection
    .find(j.ImportSpecifier, { imported: { name: "useFormState" } })
    .remove();
  if (reactDOMImportCollection.find(j.ImportSpecifier).length === 0) {
    reactDOMImportCollection.remove();
  }
  addImportDeclaration(usedName);

  // Means it's not aliased, so we also change identifier names, not only import
  if (specifier?.local?.name === "useFormState") {
    root.find(j.Identifier, { name: "useFormState" }).replaceWith(() => {
      isDirty = true;
      return j.identifier("useActionState");
    });
  }

  return isDirty ? root.toSource() : undefined;
}
