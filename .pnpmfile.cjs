module.exports = {
  hooks: {
    readPackage(pkg) {
      // Password hashing never uses Better Auth's optional development tools.
      if (pkg.name === "better-auth") {
        delete pkg.peerDependencies?.vitest;
        delete pkg.peerDependencies?.["drizzle-kit"];
        delete pkg.peerDependenciesMeta?.vitest;
        delete pkg.peerDependenciesMeta?.["drizzle-kit"];
      }
      return pkg;
    },
  },
};
