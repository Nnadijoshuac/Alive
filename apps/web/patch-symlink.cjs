const fs = require("fs");
const path = require("path");

const origSymlink = fs.symlink;
const origSymlinkSync = fs.symlinkSync;
const origPromisesSymlink = fs.promises?.symlink;

function resolveTarget(target, dest) {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(path.dirname(dest), target);
}

function copyFallbackSync(target, dest) {
  const fullTarget = resolveTarget(target, dest);
  try {
    const stat = fs.statSync(fullTarget);
    if (stat.isDirectory()) {
      fs.cpSync(fullTarget, dest, { recursive: true, dereference: true });
    } else {
      fs.copyFileSync(fullTarget, dest);
    }
  } catch (e) {
    // If target doesn't exist or already exists at dest, ignore
  }
}

async function copyFallbackAsync(target, dest) {
  const fullTarget = resolveTarget(target, dest);
  try {
    const stat = await fs.promises.stat(fullTarget);
    if (stat.isDirectory()) {
      await fs.promises.cp(fullTarget, dest, { recursive: true, dereference: true });
    } else {
      await fs.promises.copyFile(fullTarget, dest);
    }
  } catch (e) {
    // ignore
  }
}

fs.symlink = function(target, dest, type, cb) {
  if (typeof type === "function") {
    cb = type;
    type = null;
  }
  origSymlink.call(fs, target, dest, type, (err) => {
    if (err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EEXIST")) {
      try {
        copyFallbackSync(target, dest);
        return cb ? cb(null) : undefined;
      } catch (cpErr) {
        return cb ? cb(cpErr) : undefined;
      }
    }
    return cb ? cb(err) : undefined;
  });
};

fs.symlinkSync = function(target, dest, type) {
  try {
    return origSymlinkSync.call(fs, target, dest, type);
  } catch (err) {
    if (err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EEXIST")) {
      copyFallbackSync(target, dest);
      return;
    }
    throw err;
  }
};

if (fs.promises && origPromisesSymlink) {
  fs.promises.symlink = async function(target, dest, type) {
    try {
      return await origPromisesSymlink.call(fs.promises, target, dest, type);
    } catch (err) {
      if (err && (err.code === "EPERM" || err.code === "EACCES" || err.code === "EEXIST")) {
        await copyFallbackAsync(target, dest);
        return;
      }
      throw err;
    }
  };
}
