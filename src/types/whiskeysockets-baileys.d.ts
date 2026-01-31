import type {
  AnyMessageContent,
  AuthenticationCreds,
  BaileysEventEmitter,
  BaileysEventMap,
  BinaryInfo,
  BinaryNode,
  BotListInfo,
  CatalogCollection,
  ChatModification,
  ConnectionState,
  Contact,
  GetCatalogOptions,
  GroupMetadata,
  JidWithDevice,
  MediaConnInfo,
  MessageReceiptType,
  MessageRelayOptions,
  MessageRetryManager,
  MessageUpsertType,
  MiscMessageGenerationOptions,
  NewsletterMetadata,
  NewsletterUpdate,
  OrderDetails,
  ParticipantAction,
  Product,
  ProductCreate,
  ProductUpdate,
  SignalKeyStoreWithTransaction,
  SignalRepositoryWithLIDStore,
  USyncQuery,
  USyncQueryResult,
  USyncQueryResultList,
  WABusinessProfile,
  WAMediaUpload,
  WAMediaUploadFunction,
  WAMessage,
  WAMessageKey,
  WAPatchCreate,
  WAPresence,
  WAPrivacyCallValue,
  WAPrivacyGroupAddValue,
  WAPrivacyMessagesValue,
  WAPrivacyOnlineValue,
  WAPrivacyValue,
  WAReadReceiptsValue,
  proto,
} from "@whiskeysockets/baileys";
import { WebSocketClient } from "@whiskeysockets/baileys/lib/Socket/Client/websocket.js";
import {
  QuickReplyAction,
  UpdateBussinesProfileProps,
} from "@whiskeysockets/baileys/lib/Types/Bussines.js";
import { LabelActionBody } from "@whiskeysockets/baileys/lib/Types/Label.js";
import { ILogger } from "@whiskeysockets/baileys/lib/Utils/logger.js";

declare interface MakeWASocketReturn {
  communityMetadata: (jid: string) => Promise<GroupMetadata>;
  communityCreate: (subject: string, body: string) => Promise<GroupMetadata | null>;
  communityCreateGroup: (
    subject: string,
    participants: string[],
    parentCommunityJid: string,
  ) => Promise<GroupMetadata | null>;
  communityLeave: (id: string) => Promise<void>;
  communityUpdateSubject: (jid: string, subject: string) => Promise<void>;
  communityLinkGroup: (groupJid: string, parentCommunityJid: string) => Promise<void>;
  communityUnlinkGroup: (groupJid: string, parentCommunityJid: string) => Promise<void>;
  communityFetchLinkedGroups: (jid: string) => Promise<{
    communityJid: string;
    isCommunity: boolean;
    linkedGroups: {
      id: string | undefined;
      subject: string;
      creation: number | undefined;
      owner: string | undefined;
      size: number | undefined;
    }[];
  }>;
  communityRequestParticipantsList: (jid: string) => Promise<
    {
      [key: string]: string;
    }[]
  >;
  communityRequestParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: "approve" | "reject",
  ) => Promise<
    {
      status: string;
      jid: string | undefined;
    }[]
  >;
  communityParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: ParticipantAction,
  ) => Promise<
    {
      status: string;
      jid: string | undefined;
      content: BinaryNode;
    }[]
  >;
  communityUpdateDescription: (jid: string, description?: string) => Promise<void>;
  communityInviteCode: (jid: string) => Promise<string | undefined>;
  communityRevokeInvite: (jid: string) => Promise<string | undefined>;
  communityAcceptInvite: (code: string) => Promise<string | undefined>;
  communityRevokeInviteV4: (communityJid: string, invitedJid: string) => Promise<boolean>;
  communityAcceptInviteV4: (
    key: string | WAMessageKey,
    inviteMessage: proto.Message.IGroupInviteMessage,
  ) => Promise<any>;
  communityGetInviteInfo: (code: string) => Promise<GroupMetadata>;
  communityToggleEphemeral: (jid: string, ephemeralExpiration: number) => Promise<void>;
  communitySettingUpdate: (
    jid: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked",
  ) => Promise<void>;
  communityMemberAddMode: (jid: string, mode: "admin_add" | "all_member_add") => Promise<void>;
  communityJoinApprovalMode: (jid: string, mode: "on" | "off") => Promise<void>;
  communityFetchAllParticipating: () => Promise<{
    [_: string]: GroupMetadata;
  }>;
  logger: ILogger;
  getOrderDetails: (orderId: string, tokenBase64: string) => Promise<OrderDetails>;
  getCatalog: ({ jid, limit, cursor }: GetCatalogOptions) => Promise<{
    products: Product[];
    nextPageCursor: string | undefined;
  }>;
  getCollections: (
    jid?: string,
    limit?: number,
  ) => Promise<{
    collections: CatalogCollection[];
  }>;
  productCreate: (create: ProductCreate) => Promise<Product>;
  productDelete: (productIds: string[]) => Promise<{
    deleted: number;
  }>;
  productUpdate: (productId: string, update: ProductUpdate) => Promise<Product>;
  updateBussinesProfile: (args: UpdateBussinesProfileProps) => Promise<any>;
  updateCoverPhoto: (photo: WAMediaUpload) => Promise<number>;
  removeCoverPhoto: (id: string) => Promise<any>;
  sendMessageAck: ({ tag, attrs, content }: BinaryNode, errorCode?: number) => Promise<void>;
  sendRetryRequest: (node: BinaryNode, forceIncludeKeys?: boolean) => Promise<void>;
  rejectCall: (callId: string, callFrom: string) => Promise<void>;
  fetchMessageHistory: (
    count: number,
    oldestMsgKey: WAMessageKey,
    oldestMsgTimestamp: number | Long,
  ) => Promise<string>;
  requestPlaceholderResend: (messageKey: WAMessageKey) => Promise<string | undefined>;
  messageRetryManager: MessageRetryManager | null;
  getPrivacyTokens: (jids: string[]) => Promise<any>;
  assertSessions: (jids: string[], force?: boolean) => Promise<boolean>;
  relayMessage: (
    jid: string,
    message: proto.IMessage,
    options: MessageRelayOptions,
  ) => Promise<string>;
  sendReceipt: (
    jid: string,
    participant: string | undefined,
    messageIds: string[],
    type: MessageReceiptType,
  ) => Promise<void>;
  sendReceipts: (keys: WAMessageKey[], type: MessageReceiptType) => Promise<void>;
  readMessages: (keys: WAMessageKey[]) => Promise<void>;
  refreshMediaConn: (forceGet?: boolean) => Promise<MediaConnInfo>;
  waUploadToServer: WAMediaUploadFunction;
  fetchPrivacySettings: (force?: boolean) => Promise<{
    [_: string]: string;
  }>;
  sendPeerDataOperationMessage: (
    pdoMessage: proto.Message.IPeerDataOperationRequestMessage,
  ) => Promise<string>;
  createParticipantNodes: (
    recipientJids: string[],
    message: proto.IMessage,
    extraAttrs?: BinaryNode["attrs"],
    dsmMessage?: proto.IMessage,
  ) => Promise<{
    nodes: BinaryNode[];
    shouldIncludeDeviceIdentity: boolean;
  }>;
  getUSyncDevices: (
    jids: string[],
    useCache: boolean,
    ignoreZeroDevices: boolean,
  ) => Promise<
    (JidWithDevice & {
      jid: string;
    })[]
  >;
  updateMediaMessage: (message: WAMessage) => Promise<WAMessage>;
  sendMessage: (
    jid: string,
    content: AnyMessageContent,
    options?: MiscMessageGenerationOptions,
  ) => Promise<WAMessage | undefined>;
  newsletterCreate: (name: string, description?: string) => Promise<NewsletterMetadata>;
  newsletterUpdate: (jid: string, updates: NewsletterUpdate) => Promise<unknown>;
  newsletterSubscribers: (jid: string) => Promise<{ subscribers: number }>;
  newsletterMetadata: (type: "invite" | "jid", key: string) => Promise<NewsletterMetadata | null>;
  newsletterFollow: (jid: string) => Promise<unknown>;
  newsletterUnfollow: (jid: string) => Promise<unknown>;
  newsletterMute: (jid: string) => Promise<unknown>;
  newsletterUnmute: (jid: string) => Promise<unknown>;
  newsletterUpdateName: (jid: string, name: string) => Promise<unknown>;
  newsletterUpdateDescription: (jid: string, description: string) => Promise<unknown>;
  newsletterUpdatePicture: (jid: string, content: WAMediaUpload) => Promise<unknown>;
  newsletterRemovePicture: (jid: string) => Promise<unknown>;
  newsletterReactMessage: (jid: string, serverId: string, reaction?: string) => Promise<void>;
  newsletterFetchMessages: (
    jid: string,
    count: number,
    since: number,
    after: number,
  ) => Promise<any>;
  subscribeNewsletterUpdates: (jid: string) => Promise<{ duration: string } | null>;
  newsletterAdminCount: (jid: string) => Promise<number>;
  newsletterChangeOwner: (jid: string, newOwnerJid: string) => Promise<void>;
  newsletterDemote: (jid: string, userJid: string) => Promise<void>;
  newsletterDelete: (jid: string) => Promise<void>;
  groupMetadata: (jid: string) => Promise<GroupMetadata>;
  groupCreate: (subject: string, participants: string[]) => Promise<GroupMetadata>;
  groupLeave: (id: string) => Promise<void>;
  groupUpdateSubject: (jid: string, subject: string) => Promise<void>;
  groupRequestParticipantsList: (jid: string) => Promise<
    {
      [key: string]: string;
    }[]
  >;
  groupRequestParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: "approve" | "reject",
  ) => Promise<
    {
      status: string;
      jid: string | undefined;
    }[]
  >;
  groupParticipantsUpdate: (
    jid: string,
    participants: string[],
    action: ParticipantAction,
  ) => Promise<
    {
      status: string;
      jid: string | undefined;
      content: BinaryNode;
    }[]
  >;
  groupUpdateDescription: (jid: string, description?: string) => Promise<void>;
  groupInviteCode: (jid: string) => Promise<string | undefined>;
  groupRevokeInvite: (jid: string) => Promise<string | undefined>;
  groupAcceptInvite: (code: string) => Promise<string | undefined>;
  groupRevokeInviteV4: (groupJid: string, invitedJid: string) => Promise<boolean>;
  groupAcceptInviteV4: (
    key: string | WAMessageKey,
    inviteMessage: proto.Message.IGroupInviteMessage,
  ) => Promise<any>;
  groupGetInviteInfo: (code: string) => Promise<GroupMetadata>;
  groupToggleEphemeral: (jid: string, ephemeralExpiration: number) => Promise<void>;
  groupSettingUpdate: (
    jid: string,
    setting: "announcement" | "not_announcement" | "locked" | "unlocked",
  ) => Promise<void>;
  groupMemberAddMode: (jid: string, mode: "admin_add" | "all_member_add") => Promise<void>;
  groupJoinApprovalMode: (jid: string, mode: "on" | "off") => Promise<void>;
  groupFetchAllParticipating: () => Promise<{ [_: string]: GroupMetadata }>;
  createCallLink: (
    type: "audio" | "video",
    event?: {
      startTime: number;
    },
    timeoutMs?: number,
  ) => Promise<string | undefined>;
  getBotListV2: () => Promise<BotListInfo[]>;
  processingMutex: {
    mutex<T>(code: () => Promise<T> | T): Promise<T>;
  };
  upsertMessage: (msg: WAMessage, type: MessageUpsertType) => Promise<void>;
  appPatch: (patchCreate: WAPatchCreate) => Promise<void>;
  sendPresenceUpdate: (type: WAPresence, toJid?: string) => Promise<void>;
  presenceSubscribe: (toJid: string, tcToken?: Buffer) => Promise<void>;
  profilePictureUrl: (
    jid: string,
    type?: "preview" | "image",
    timeoutMs?: number,
  ) => Promise<string | undefined>;
  fetchBlocklist: () => Promise<(string | undefined)[]>;
  fetchStatus: (...jids: string[]) => Promise<USyncQueryResultList[] | undefined>;
  fetchDisappearingDuration: (...jids: string[]) => Promise<USyncQueryResultList[] | undefined>;
  updateProfilePicture: (
    jid: string,
    content: WAMediaUpload,
    dimensions?: {
      width: number;
      height: number;
    },
  ) => Promise<void>;
  removeProfilePicture: (jid: string) => Promise<void>;
  updateProfileStatus: (status: string) => Promise<void>;
  updateProfileName: (name: string) => Promise<void>;
  updateBlockStatus: (jid: string, action: "block" | "unblock") => Promise<void>;
  updateDisableLinkPreviewsPrivacy: (isPreviewsDisabled: boolean) => Promise<void>;
  updateCallPrivacy: (value: WAPrivacyCallValue) => Promise<void>;
  updateMessagesPrivacy: (value: WAPrivacyMessagesValue) => Promise<void>;
  updateLastSeenPrivacy: (value: WAPrivacyValue) => Promise<void>;
  updateOnlinePrivacy: (value: WAPrivacyOnlineValue) => Promise<void>;
  updateProfilePicturePrivacy: (value: WAPrivacyValue) => Promise<void>;
  updateStatusPrivacy: (value: WAPrivacyValue) => Promise<void>;
  updateReadReceiptsPrivacy: (value: WAReadReceiptsValue) => Promise<void>;
  updateGroupsAddPrivacy: (value: WAPrivacyGroupAddValue) => Promise<void>;
  updateDefaultDisappearingMode: (duration: number) => Promise<void>;
  getBusinessProfile: (jid: string) => Promise<WABusinessProfile | void>;
  resyncAppState: (
    collections: readonly (
      | "critical_unblock_low"
      | "regular_high"
      | "regular_low"
      | "critical_block"
      | "regular"
    )[],
    isInitialSync: boolean,
  ) => Promise<void>;
  chatModify: (mod: ChatModification, jid: string) => Promise<void>;
  cleanDirtyBits: (
    type: "account_sync" | "groups",
    fromTimestamp?: number | string,
  ) => Promise<void>;
  addOrEditContact: (jid: string, contact: proto.SyncActionValue.IContactAction) => Promise<void>;
  removeContact: (jid: string) => Promise<void>;
  addLabel: (jid: string, labels: LabelActionBody) => Promise<void>;
  addChatLabel: (jid: string, labelId: string) => Promise<void>;
  removeChatLabel: (jid: string, labelId: string) => Promise<void>;
  addMessageLabel: (jid: string, messageId: string, labelId: string) => Promise<void>;
  removeMessageLabel: (jid: string, messageId: string, labelId: string) => Promise<void>;
  star: (
    jid: string,
    messages: {
      id: string;
      fromMe?: boolean;
    }[],
    star: boolean,
  ) => Promise<void>;
  addOrEditQuickReply: (quickReply: QuickReplyAction) => Promise<void>;
  removeQuickReply: (timestamp: string) => Promise<void>;
  type: "md";
  ws: WebSocketClient;
  ev: BaileysEventEmitter & {
    process(handler: (events: Partial<BaileysEventMap>) => void | Promise<void>): () => void;
    buffer(): void;
    createBufferedFunction<A extends any[], T>(
      work: (...args: A) => Promise<T>,
    ): (...args: A) => Promise<T>;
    flush(): boolean;
    isBuffering(): boolean;
  };
  authState: {
    creds: AuthenticationCreds;
    keys: SignalKeyStoreWithTransaction;
  };
  signalRepository: SignalRepositoryWithLIDStore;
  user: Contact | undefined;
  generateMessageTag: () => string;
  query: (node: BinaryNode, timeoutMs?: number) => Promise<any>;
  waitForMessage: <T>(msgId: string, timeoutMs?: number) => Promise<T | undefined>;
  waitForSocketOpen: () => Promise<void>;
  sendRawMessage: (data: Uint8Array | Buffer) => Promise<void>;
  sendNode: (frame: BinaryNode) => Promise<void>;
  logout: (msg?: string) => Promise<void>;
  end: (error: Error | undefined) => void;
  onUnexpectedError: (err: Error, msg: string) => void;
  uploadPreKeys: (count?: number, retryCount?: number) => Promise<void>;
  uploadPreKeysToServerIfRequired: () => Promise<void>;
  digestKeyBundle: () => Promise<void>;
  rotateSignedPreKey: () => Promise<void>;
  requestPairingCode: (phoneNumber: string, customPairingCode?: string) => Promise<string>;
  wamBuffer: BinaryInfo;
  waitForConnectionUpdate: (
    check: (u: Partial<ConnectionState>) => Promise<boolean | undefined>,
    timeoutMs?: number,
  ) => Promise<void>;
  sendWAMBuffer: (wamBuffer: Buffer) => Promise<any>;
  executeUSyncQuery: (usyncQuery: USyncQuery) => Promise<USyncQueryResult | undefined>;
  onWhatsApp: (...phoneNumber: string[]) => Promise<
    | {
        jid: string;
        exists: boolean;
      }[]
    | undefined
  >;
}
