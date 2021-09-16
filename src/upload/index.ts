import _Upload from './upload';
import { withInstall, WithInstallType } from '../utils/withInstall';
import { TdUploadProps } from './type';
import mapProps from '../utils/map-props';

export * from './type';
export type UploadProps = TdUploadProps;

export const Upload: WithInstallType<typeof _Upload> = withInstall(mapProps([{
  name: 'files', event: 'change', alias: ['modelValue']
}])(_Upload));
export default Upload;
