#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StoryahubContacts, NSObject)

RCT_EXTERN_METHOD(fetchContacts:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(exportContacts:(NSArray *)contacts
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
