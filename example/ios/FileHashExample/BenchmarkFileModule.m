#import <Foundation/Foundation.h>
#import <React/RCTBridgeModule.h>

static const NSUInteger ZFHBenchmarkChunkSize = 1024 * 1024;

@interface BenchmarkFileModule : NSObject <RCTBridgeModule>
@end

@implementation BenchmarkFileModule

RCT_EXPORT_MODULE(BenchmarkFile)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_REMAP_METHOD(createFile,
                 createFileWithSizeBytes:(nonnull NSNumber *)sizeBytes
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
    long long requestedSize = sizeBytes.longLongValue;
    if (requestedSize <= 0) {
      reject(@"E_INVALID_SIZE", @"Benchmark file size must be positive", nil);
      return;
    }

    NSFileManager *fileManager = NSFileManager.defaultManager;
    NSURL *cacheURL = [fileManager URLsForDirectory:NSCachesDirectory
                                          inDomains:NSUserDomainMask].firstObject;
    NSURL *directoryURL = [cacheURL URLByAppendingPathComponent:@"zfh-benchmark"
                                                    isDirectory:YES];

    NSError *error = nil;
    if (![fileManager createDirectoryAtURL:directoryURL
               withIntermediateDirectories:YES
                                attributes:nil
                                     error:&error]) {
      reject(@"E_CREATE_DIR", @"Failed to create benchmark cache directory", error);
      return;
    }

    NSString *fileName = [NSString stringWithFormat:@"payload-%lld.bin", requestedSize];
    NSURL *fileURL = [directoryURL URLByAppendingPathComponent:fileName];
    NSDictionary<NSFileAttributeKey, id> *attributes =
        [fileManager attributesOfItemAtPath:fileURL.path error:nil];
    if ([attributes[NSFileSize] unsignedLongLongValue] == (unsigned long long)requestedSize) {
      resolve(fileURL.path);
      return;
    }

    if ([fileManager fileExistsAtPath:fileURL.path] &&
        ![fileManager removeItemAtURL:fileURL error:&error]) {
      reject(@"E_DELETE_FILE", @"Failed to replace benchmark file", error);
      return;
    }

    if (![fileManager createFileAtPath:fileURL.path contents:nil attributes:nil]) {
      reject(@"E_CREATE_FILE", @"Failed to create benchmark file", nil);
      return;
    }

    NSFileHandle *handle = [NSFileHandle fileHandleForWritingToURL:fileURL error:&error];
    if (handle == nil) {
      reject(@"E_OPEN_FILE", @"Failed to open benchmark file", error);
      return;
    }

    NSMutableData *chunk = [NSMutableData dataWithLength:ZFHBenchmarkChunkSize];
    uint8_t *bytes = chunk.mutableBytes;
    for (NSUInteger i = 0; i < ZFHBenchmarkChunkSize; i += 1) {
      bytes[i] = (uint8_t)(i & 0xff);
    }

    long long remaining = requestedSize;
    while (remaining > 0) {
      @autoreleasepool {
        NSUInteger count =
            (NSUInteger)((remaining < (long long)ZFHBenchmarkChunkSize)
                             ? remaining
                             : (long long)ZFHBenchmarkChunkSize);
        if (count == ZFHBenchmarkChunkSize) {
          [handle writeData:chunk];
        } else {
          [handle writeData:[chunk subdataWithRange:NSMakeRange(0, count)]];
        }
        remaining -= (long long)count;
      }
    }

    [handle synchronizeFile];
    [handle closeFile];
    resolve(fileURL.path);
  });
}

RCT_EXPORT_METHOD(log:(NSString *)message)
{
  NSLog(@"%@", message);
}

@end
