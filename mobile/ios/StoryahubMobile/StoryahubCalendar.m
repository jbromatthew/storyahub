#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(StoryahubCalendar, NSObject)

RCT_EXTERN_METHOD(fetchEvents:(NSDictionary *)range
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(exportEvents:(NSArray *)events
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
