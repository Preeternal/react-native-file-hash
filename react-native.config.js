module.exports = {
  dependency: {
    platforms: {
      ios: {
        podspecPath: 'ios/FileHash.podspec',
      },
      android: {
        packageImportPath: 'import com.preeternal.filehash.FileHashPackage;',
        packageInstance: 'new FileHashPackage()',
      },
    },
  },
};