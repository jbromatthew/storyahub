#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StoryahubImagePicker, NSObject)

RCT_EXTERN_METHOD(pickFromCamera:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pickFromLibrary:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
