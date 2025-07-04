require "json"

package = JSON.parse(File.read(File.join(__dir__, "..", "package.json")))

Pod::Spec.new do |s|
  s.name         = "FileHash"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]
  s.source       = { :git => package["repository"]["url"], :tag => s.version }

  s.ios.deployment_target = "11.0"
  s.source_files = "FileHash.{h,m,swift}"
  
  # Для новой архитектуры
  s.platforms    = { :ios => "12.4" }
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_VERSION' => '5.0'
  }

  s.dependency "React-Core"
end