declare module "SpatialScreening" {

    export interface District {
        feature: import("ol").Feature
        statFeatures: import("ol").Feature[]
        getId(): string | number
        getLabel(): string
        getName(): string
    }

    export interface DistrictLevel {
        layerId: string,
        label: string,
        keyOfAttrName: string,
        duplicateDistrictNames?: string[]
        stats?: {
            keyOfAttrName: string
            baseUrl: string[]
            featureTypes?: string[]
            metadataUrls?: string[]
        }
        referenceLevel?: DistrictLevel
        districts?: District[]
    }
}