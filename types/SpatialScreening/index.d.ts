import { Polygon } from "ol/geom"

declare module "SpatialScreening" {

    export interface District {
        feature: import("ol").Feature<Polygon>
        stats: {
            [category: string]: import("ol").Feature
        }
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
            featureTypes?: string[][]
            metadataUrls?: string[]
            propertyNameList?: string[][]
        }
        referenceLevel?: DistrictLevel
        districts?: District[]
    }

    export type Operation = "geom" | "sum" | "mean" | "median"
    // export type AreaOperation = "area" | "sum" | "mean" | "median"
    // export type LineOperation = "line" | "sum" | "mean" | "median"
}