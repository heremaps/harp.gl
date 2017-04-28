import { DataStoreClient, HRN, CatalogClient, CatalogLayer } from "@here/hype";
import { DataProvider } from "./DataProvider";
import { TileKey } from "@here/geoutils";

export interface HypeDataProviderOptions {
    hrn: HRN;
    appId: string;
    appCode: string;
    layer: string;
    proxyDataUrl?: string;
    catalogVersion?: number;
}

export class HypeDataProvider extends DataProvider {
    private readonly m_dataStoreClient: DataStoreClient;
    private m_Layer: CatalogLayer;
    private m_catalogClient: CatalogClient;

    constructor(private readonly m_options: HypeDataProviderOptions) {
        super();
        this.m_dataStoreClient = new DataStoreClient(m_options.appId, m_options.appCode, m_options.hrn);
    }

    ready(): boolean {
        return this.m_Layer !== undefined;
    }

    async connect(): Promise<void> {
        this.m_catalogClient = await this.m_dataStoreClient.getCatalogClient(this.m_options.catalogVersion);
        const layer = this.m_catalogClient.layers.get(this.m_options.layer);
        if (layer === undefined)
            throw new Error(`layer ${this.m_options.layer} not found in catalog`);
        this.m_Layer = layer;
        if (this.m_options.proxyDataUrl !== undefined && this.m_options.proxyDataUrl.length > 0)
            this.m_Layer.dataUrl = this.m_options.proxyDataUrl;
    }

    async getTile(tileKey: TileKey): Promise<ArrayBuffer> {
        const response = await this.m_catalogClient.getTile(this.m_Layer, tileKey);
        return response.arrayBuffer();
    }
}
